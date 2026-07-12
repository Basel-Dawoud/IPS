import { useEffect, useMemo, useRef } from "react";
import { useSettings } from "@/features/settings/settings-provider";
import { apiClient } from "@/lib/api-client";
import { replayWalk } from "./replay-engine";

function lerpAnchors(
  anchors: { tMs: number; x: number; y: number }[],
  tMs: number,
): { x: number; y: number } {
  if (!anchors || anchors.length === 0) return { x: 0, y: 0 };
  if (tMs <= anchors[0].tMs) return { x: anchors[0].x, y: anchors[0].y };
  const last = anchors[anchors.length - 1];
  if (tMs >= last.tMs) return { x: last.x, y: last.y };
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (tMs <= b.tMs) {
      const f = (tMs - a.tMs) / Math.max(1, b.tMs - a.tMs);
      return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) };
    }
  }
  return { x: last.x, y: last.y };
}

function predAt(
  samples: any[],
  tMs: number,
  smootherMode: "pdr" | "kalman" | "rts" = "kalman",
): { x: number; y: number } | null {
  let best: any = null;
  for (const s of samples) {
    if (s.tMs > tMs) break;
    if (s.y != null) best = s;
  }
  if (!best) return null;
  const val = smootherMode === "rts" ? (best.yRts ?? best.y) : best.y;
  return { x: val, y: 8 };
}

// Playback frame spacing: the whole session is pre-sampled onto this fixed grid
// at load (~20 fps). 50 ms is smooth for a walking dot and caps the re-render
// rate; playback then just looks up the current frame instead of recomputing.
const FRAME_MS = 50;

function walkDurationMs(w: any): number {
  if (w?.events?.length) return w.events[w.events.length - 1].tMs;
  if (w?.anchors?.length) return w.anchors[w.anchors.length - 1].tMs;
  const start = new Date(w.startedAt).getTime();
  const end = new Date(w.endedAt).getTime();
  return Math.max(0, end - start);
}

// Position shown for a given playhead time. This is the SAME math the live
// playback used before — it only moved here so it can be pre-baked at load.
// Prediction (predAt / lerpAnchors / model samples) is untouched.
function computeSimPos(
  t: number,
  source: "truth" | "model",
  smoother: "pdr" | "kalman" | "rts",
  samples: any[] | null,
  anchors: { tMs: number; x: number; y: number }[],
): { x: number; y: number } {
  if (source === "model") {
    const pred = samples ? predAt(samples, t, smoother) : null;
    if (pred && pred.x !== null) return { x: pred.x, y: pred.y };
    // ONNX returned null (native not linked / Expo Go) — synthetic prediction.
    const truth = lerpAnchors(anchors, t);
    const seed1 = Math.sin(t / 120);
    const seed2 = Math.cos(t / 40);
    const amp = smoother === "pdr" ? 0.4 : smoother === "kalman" ? 0.15 : 0.0;
    const noise = (seed1 * 1.2 + seed2 * 0.5) * amp;
    return { x: truth.y + noise, y: 8 };
  }
  const pos = lerpAnchors(anchors, t);
  return { x: pos.y, y: 8 };
}

// Pre-sample the entire session onto the FRAME_MS grid once, at load.
function buildFrames(
  source: "truth" | "model",
  smoother: "pdr" | "kalman" | "rts",
  samples: any[] | null,
  anchors: { tMs: number; x: number; y: number }[],
  durationMs: number,
): { x: number; y: number }[] {
  const frames: { x: number; y: number }[] = [];
  for (let t = 0; t <= durationMs; t += FRAME_MS) {
    frames.push(computeSimPos(t, source, smoother, samples, anchors));
  }
  return frames;
}

export function useTrajectorySimulation() {
  const {
    bypassEnabled,
    bypassMode,
    bypassFloor,
    setBypassPosition,
    bypassVideoSessionId,
    bypassVideoWalkIndex,
    bypassVideoModel,
    bypassVideoPositionSource,
    bypassVideoModelSmoother,
    simWalk,
    setSimWalk,
    simPlaying,
    setSimPlaying,
    simLoading,
    setSimLoading,
    simError,
    setSimError,
    isUsingMock,
    setIsUsingMock,
  } = useSettings();

  const simLastTsRef = useRef<number | null>(null);
  const simRafRef = useRef<number | null>(null);
  // The playhead lives in a ref (not global context state) so advancing it
  // ~60×/sec no longer re-renders every useSettings() consumer. The RAF loop
  // reads/writes this and drives the fake position directly.
  const playheadMsRef = useRef(0);
  // Last frame index committed to the map — so we only push a new position when
  // the playhead actually crosses into a new frame (dedups redundant writes).
  const lastFrameIdxRef = useRef(-1);

  const simDurationMs = useMemo(() => {
    if (!simWalk) return 0;
    if (simWalk.events && simWalk.events.length > 0) {
      return simWalk.events[simWalk.events.length - 1].tMs;
    }
    if (simWalk.anchors && simWalk.anchors.length > 0) {
      return simWalk.anchors[simWalk.anchors.length - 1].tMs;
    }
    const start = new Date(simWalk.startedAt).getTime();
    const end = new Date(simWalk.endedAt).getTime();
    return Math.max(0, end - start);
  }, [simWalk]);

  // Fetch simulation walk replay tape
  useEffect(() => {
    if (!bypassEnabled || bypassMode !== "video" || !bypassVideoSessionId) {
      setSimWalk(null);
      setSimPlaying(false);
      playheadMsRef.current = 0;
      return;
    }

    // Check if already loaded with the same settings
    if (
      simWalk &&
      simWalk._sessionId === bypassVideoSessionId &&
      simWalk._walkIndex === bypassVideoWalkIndex &&
      simWalk._model === bypassVideoModel &&
      simWalk._source === bypassVideoPositionSource &&
      simWalk._smoother === bypassVideoModelSmoother
    ) {
      return;
    }

    let active = true;
    setSimLoading(true);
    setSimError(null);

    apiClient
      .get(`/admin/trajectory/sessions/${bypassVideoSessionId}/replay`)
      .then((res: any) => {
        if (!active) return;
        const replayData = res.data;
        const walks = replayData?.walks || [];
        if (walks.length === 0) {
          setSimError("Selected session has no walks.");
        } else {
          // Select the chosen walk index, clamped to bounds
          const walkIdx = Math.max(0, Math.min(bypassVideoWalkIndex, walks.length - 1));
          const currentWalk = walks[walkIdx];

          if (bypassVideoPositionSource === "model") {
            setSimLoading(true);
            replayWalk(currentWalk, {
              variant: bypassVideoModel as any,
              floorTrue: replayData.session?.floorLevel ?? bypassFloor,
              mode: bypassVideoModelSmoother === "rts" ? "kalman" : (bypassVideoModelSmoother as any),
            })
              .then((result) => {
                if (!active) return;
                const hasRealPreds =
                  result.samples && result.samples.some((s) => s.y !== null);
                setIsUsingMock(!hasRealPreds);
                setSimWalk({
                  ...currentWalk,
                  samples: result.samples,
                  frames: buildFrames(
                    "model",
                    bypassVideoModelSmoother,
                    result.samples,
                    currentWalk.anchors,
                    walkDurationMs(currentWalk),
                  ),
                  frameMs: FRAME_MS,
                  _sessionId: bypassVideoSessionId,
                  _walkIndex: bypassVideoWalkIndex,
                  _model: bypassVideoModel,
                  _source: bypassVideoPositionSource,
                  _smoother: bypassVideoModelSmoother,
                });
                playheadMsRef.current = 0;
                lastFrameIdxRef.current = -1;
                setSimPlaying(true);

                // Initial position using model predictions
                const firstSample = result.samples[0];
                if (firstSample && firstSample.y !== null) {
                  setBypassPosition({
                    x: firstSample.y,
                    y: 8,
                    floor: replayData.session?.floorLevel ?? bypassFloor,
                  });
                } else {
                  // Fallback starting position
                  setBypassPosition({
                    x: currentWalk.startY,
                    y: 8,
                    floor: replayData.session?.floorLevel ?? bypassFloor,
                  });
                }
              })
              .catch((err: any) => {
                if (!active) return;
                setSimError(err.message || "Failed to run model replay.");
                setIsUsingMock(true);
              })
              .finally(() => {
                if (active) setSimLoading(false);
              });
          } else {
            setIsUsingMock(false);
            setSimWalk({
              ...currentWalk,
              frames: buildFrames(
                "truth",
                bypassVideoModelSmoother,
                null,
                currentWalk.anchors,
                walkDurationMs(currentWalk),
              ),
              frameMs: FRAME_MS,
              _sessionId: bypassVideoSessionId,
              _walkIndex: bypassVideoWalkIndex,
              _model: bypassVideoModel,
              _source: bypassVideoPositionSource,
              _smoother: bypassVideoModelSmoother,
            });
            playheadMsRef.current = 0;
            lastFrameIdxRef.current = -1;
            setSimPlaying(true);

            // Initial coordinates set to start of walk (ground truth anchors)
            const initialPos =
              currentWalk.anchors?.length > 0
                ? currentWalk.anchors[0]
                : { x: currentWalk.startX, y: currentWalk.startY };
            setBypassPosition({
              x: initialPos.y,
              y: 8,
              floor: replayData.session?.floorLevel ?? bypassFloor,
            });
          }
        }
      })
      .catch((err: any) => {
        if (!active) return;
        setSimError(err.message || "Failed to load simulation.");
      })
      .finally(() => {
        if (active) setSimLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    bypassEnabled,
    bypassMode,
    bypassVideoSessionId,
    bypassVideoWalkIndex,
    bypassVideoModel,
    bypassVideoPositionSource,
    bypassVideoModelSmoother,
  ]);

  // Simulation playback loop. The whole session is pre-baked into simWalk.frames
  // at load, so the loop only advances the playhead ref and, when it crosses a
  // new frame, pushes that precomputed position. No per-frame prediction, no
  // scanning, no SecureStore write — so play/pause is instant and smooth and the
  // JS thread stays free for gestures.
  useEffect(() => {
    if (!simPlaying || !simWalk || simDurationMs <= 0) {
      simLastTsRef.current = null;
      return;
    }
    const frames: { x: number; y: number }[] = simWalk.frames ?? [];
    const frameMs: number = simWalk.frameMs ?? FRAME_MS;
    if (frames.length === 0) {
      simLastTsRef.current = null;
      return;
    }

    let active = true;
    const commit = (idx: number) => {
      const clamped = Math.max(0, Math.min(frames.length - 1, idx));
      if (clamped === lastFrameIdxRef.current) return;
      lastFrameIdxRef.current = clamped;
      const f = frames[clamped];
      setBypassPosition({ x: f.x, y: f.y }, { persist: false });
    };

    const step = (ts: number) => {
      if (!active) return;
      if (simLastTsRef.current == null) simLastTsRef.current = ts;
      const dt = ts - simLastTsRef.current;
      simLastTsRef.current = ts;

      const next = Math.min(playheadMsRef.current + dt, simDurationMs);
      playheadMsRef.current = next;

      if (next >= simDurationMs) {
        commit(frames.length - 1); // land the final frame exactly
        setSimPlaying(false);
        return; // stop looping at the end
      }

      commit(Math.floor(next / frameMs));
      simRafRef.current = requestAnimationFrame(step);
    };

    simRafRef.current = requestAnimationFrame(step);

    return () => {
      active = false;
      if (simRafRef.current) cancelAnimationFrame(simRafRef.current);
      simLastTsRef.current = null;
    };
  }, [simPlaying, simWalk, simDurationMs]);

  const toggleSimulation = () => {
    if (playheadMsRef.current >= simDurationMs) {
      // Restart from the beginning.
      playheadMsRef.current = 0;
      lastFrameIdxRef.current = -1;
      setSimPlaying(true);
    } else {
      setSimPlaying((p: boolean) => !p);
    }
  };

  return {
    simPlaying,
    setSimPlaying,
    simWalk,
    simLoading,
    simError,
    simDurationMs,
    isUsingMock,
    toggleSimulation,
    bypassEnabled,
    bypassMode,
  };
}
