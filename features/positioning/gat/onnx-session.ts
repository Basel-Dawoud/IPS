/**
 * ONNX session loader + dual-input inference for the GAT hybrid models.
 *
 * Lazy `require()` keeps the JS bundle working under Expo Go (no native
 * onnxruntime module). Sessions are cached per variant so the runtime model
 * selector can switch without reloading.
 *
 * The model is dual-input / dual-output:
 *   inputs : sequence_input [1, 5, N]   beacon_graph_input [1, 7, 6]
 *   outputs: y_output [1, 1] (linear)   floor_output [1, 1] (sigmoid)
 *
 * CRITICAL: the export output ORDER differs between variants (without_wifi/v1
 * emit floor first, v2 emits y first), so tensors are ALWAYS bound by NAME.
 */
import { Asset } from "expo-asset";
import { NativeModules } from "react-native";
import {
  FLOOR_OUTPUT,
  GRAPH_INPUT,
  N_BEACON_FEATS,
  NUM_BEACONS,
  SEQUENCE_INPUT,
  Y_OUTPUT,
} from "./constants";
import { getGatConfig, type GatVariant } from "./model-configs";

type OrtTensor = { data?: ArrayLike<number>; cpuData?: ArrayLike<number>; dims?: number[] };

type OrtSession = {
  inputNames: string[];
  outputNames: string[];
  run: (feeds: Record<string, unknown>) => Promise<Record<string, OrtTensor>>;
};

type OrtModule = {
  InferenceSession: { create: (uri: string) => Promise<OrtSession> };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => unknown;
};

let ort: OrtModule | null = null;
let loadAttempted = false;

const sessions: Partial<Record<GatVariant, Promise<OrtSession | null>>> = {};
/** Last load-failure message per variant — surfaced to the UI instead of a generic "session null". */
const loadErrors: Partial<Record<GatVariant, string>> = {};

/** The real ONNX load error for a variant (set when getSession resolved null), or null. */
export function getLoadError(variant: GatVariant): string | null {
  return loadErrors[variant] ?? null;
}

function loadOrt(): OrtModule | null {
  if (ort) return ort;
  if (loadAttempted) return null;
  loadAttempted = true;

  if (!NativeModules.Onnxruntime) {
    console.warn(
      "[gat/onnx] NativeModules.Onnxruntime not found — run a dev client build (npx expo run:android) to link the native library.",
    );
    return null;
  }

  try {
    const mod = require("onnxruntime-react-native") as OrtModule;
    if (!mod || typeof mod.InferenceSession?.create !== "function") {
      console.warn("[gat/onnx] InferenceSession.create not available after load");
      return null;
    }
    ort = mod;
    return mod;
  } catch (err) {
    console.warn("[gat/onnx] require failed:", err);
    return null;
  }
}

export function isOrtAvailable(): boolean {
  return loadOrt() !== null;
}

async function loadSession(variant: GatVariant): Promise<OrtSession | null> {
  const lib = loadOrt();
  if (!lib) {
    loadErrors[variant] = "native onnxruntime not linked (Expo Go / needs a dev build)";
    return null;
  }
  // Tag each step so a thrown error says WHICH stage failed (asset resolve,
  // download, or InferenceSession.create) — the create() step is where an
  // unsupported op / bad graph surfaces.
  let stage = "resolve asset";
  try {
    const asset = Asset.fromModule(getGatConfig(variant).loadAsset());
    stage = "download asset";
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    stage = `create session (${uri?.split("/").pop() ?? uri})`;
    const session = await lib.InferenceSession.create(uri);
    if (
      !session.inputNames?.includes(SEQUENCE_INPUT) ||
      !session.inputNames?.includes(GRAPH_INPUT)
    ) {
      console.warn(
        `[gat/onnx] variant=${variant} unexpected input names:`,
        session.inputNames,
      );
    }
    delete loadErrors[variant];
    return session;
  } catch (err: any) {
    loadErrors[variant] = `[${stage}] ${err?.message ?? String(err)}`;
    throw err;
  }
}

/** Get (and cache) the session for a variant. Resolves to null when ORT is unavailable. */
export function getSession(variant: GatVariant): Promise<OrtSession | null> {
  const cached = sessions[variant];
  if (cached) return cached;
  const p = loadSession(variant).catch((err) => {
    console.warn(`[gat/onnx] failed to load variant=${variant}:`, err);
    sessions[variant] = undefined;
    return null;
  });
  sessions[variant] = p;
  return p;
}

/** Warm a variant's session ahead of time (e.g. on model-selector change). Resolves once loaded (null if ORT unavailable). */
export function warmSession(variant: GatVariant): Promise<OrtSession | null> {
  return getSession(variant);
}

/** Drop all cached sessions (e.g. for a hard reset). */
export function resetSessions(): void {
  (Object.keys(sessions) as GatVariant[]).forEach((k) => {
    delete sessions[k];
  });
}

export interface GatRawOutput {
  /** Normalized corridor position (pre de-normalization). */
  yNorm: number;
  /** Floor head sigmoid probability in [0, 1]. */
  floorProb: number;
}

function readScalar(t: OrtTensor | undefined): number | null {
  if (!t) return null;
  const raw = (t.data ?? t.cpuData) as ArrayLike<number> | undefined;
  if (!raw || raw.length === 0) return null;
  const v = Number(raw[0]);
  return Number.isFinite(v) ? v : null;
}

/**
 * Run inference. `sequence` is row-major [WINDOW_SIZE * seqN]; `graph` is
 * row-major [NUM_BEACONS * N_BEACON_FEATS]. Returns the raw (pre-decode) heads,
 * or null if the session/output is unavailable.
 */
export async function runGat(
  variant: GatVariant,
  sequence: Float32Array,
  graph: Float32Array | null,
  seqN: number,
): Promise<GatRawOutput | null> {
  const session = await getSession(variant);
  const lib = ort;
  if (!session || !lib) return null;

  // The sequence length is per-variant (5 for the originals, 30/48 for the v3
  // time-window models), so derive it from the config rather than a constant.
  const windowSize = getGatConfig(variant).windowSize;
  const seqTensor = new lib.Tensor("float32", sequence, [1, windowSize, seqN]);

  // Single-input variants (nowifi_v3) have no beacon_graph_input — feeding an
  // input name the model doesn't declare makes ONNX Runtime throw, so only add
  // the graph feed when a graph tensor is supplied. Node width is per-variant
  // (6 classic, 8 for wifi_geom), so derive it from the payload length.
  const feeds: Record<string, unknown> = { [SEQUENCE_INPUT]: seqTensor };
  if (graph) {
    const graphFeats = graph.length / NUM_BEACONS || N_BEACON_FEATS;
    feeds[GRAPH_INPUT] = new lib.Tensor("float32", graph, [1, NUM_BEACONS, graphFeats]);
  }

  const out = await session.run(feeds);

  const yNorm = readScalar(out[Y_OUTPUT]);
  const floorProb = readScalar(out[FLOOR_OUTPUT]);
  if (yNorm === null || floorProb === null) {
    console.warn(`[gat/onnx] variant=${variant} missing y/floor output`, Object.keys(out));
    return null;
  }
  return { yNorm, floorProb };
}
