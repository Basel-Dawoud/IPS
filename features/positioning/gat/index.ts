/**
 * Dual-input GAT hybrid localizer (Temporal Transformer + Beacon Graph
 * Attention). Public surface for the positioning hook + UI.
 */
export * from "./constants";
export * from "./model-configs";
export * from "./cv-filter";
export { engineerWindow, type EngineeredWindow, type FeatureRow } from "./feature-engineering";
export { extractBeaconGraph } from "./graph";
export { scaleSequence, scaleGraph, decodeY, decodeFloor } from "./normalize";
export {
  GatLocalizer,
  type GatPrediction,
  type PostProcessMode,
  type MotionContext,
} from "./localizer";
export {
  isOrtAvailable,
  getSession,
  warmSession,
  getLoadError,
  resetSessions,
  runGat,
  type GatRawOutput,
} from "./onnx-session";
