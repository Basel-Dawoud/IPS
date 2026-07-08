/**
 * Constant-velocity 1-D Kalman filter, shared by the live `velocity` post-process
 * mode (localizer.ts) AND the offline RTS smoother (replay-engine.ts) AND the
 * regression harness — so the robust update lives in exactly ONE place.
 *
 * State x = [position, velocity]. Predicts forward by the estimated walking speed
 * so a steady walk has no systematic lag (unlike the constant-position OneDKalman).
 *
 * Robustness (all from constants.ts CV_*):
 *   #1 adaptive R_k = CV_R · beaconFactor · innovFactor (heteroscedastic BLE noise)
 *   #2 soft innovation gating (Mahalanobis d² > CV_GATE_D2 ⇒ inflate R, not drop)
 *   #3 process accel σa = lerp(still, walk, conf²)  (stickier stops)
 *   #4 dt-independent soft-ZUPT velocity decay  v *= exp(−dt·(1−conf)/CV_TAU)
 *   #6 gap re-init (dt > CV_GAP_S ⇒ inflate P, zero velocity, re-acquire)
 *   #7 velocity initialized from the first two observations
 *   #9 Joseph-form covariance update (numerically stable as R varies)
 *   #10 symmetrize P each step
 */
import {
  CV_ACCEL_STILL,
  CV_ACCEL_WALK,
  CV_DT_MAX,
  CV_DT_MIN,
  CV_GAP_S,
  CV_GATE_D2,
  CV_GATE_R_INFLATE,
  CV_INNOV_ALPHA,
  CV_INNOV_CLAMP_HI,
  CV_INNOV_CLAMP_LO,
  CV_R,
  CV_R_BEACON_MAX,
  CV_R_BEACON_MIN,
  CV_R_BEACON_REF,
  CV_TAU,
} from "./constants";

// --- 2x2 linear algebra (row-major [m00, m01, m10, m11]) — shared with the RTS backward pass ---
export type Mat2 = [number, number, number, number];
export type Vec2 = [number, number];
export const m2mul = (A: Mat2, B: Mat2): Mat2 => [
  A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3],
  A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3],
];
export const m2T = (A: Mat2): Mat2 => [A[0], A[2], A[1], A[3]];
export const m2inv = (A: Mat2): Mat2 => {
  const det = A[0] * A[3] - A[1] * A[2];
  const d = Math.abs(det) < 1e-12 ? (det < 0 ? -1e-12 : 1e-12) : det;
  return [A[3] / d, -A[1] / d, -A[2] / d, A[0] / d];
};
export const m2vec = (A: Mat2, v: Vec2): Vec2 => [A[0] * v[0] + A[1] * v[1], A[2] * v[0] + A[3] * v[1]];

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** #1 measurement-noise scale from unique-beacon count: fewer beacons ⇒ trust the measurement less. */
export function beaconRFactor(uniqueBeacons: number): number {
  return clamp(CV_R_BEACON_REF / Math.max(1, uniqueBeacons), CV_R_BEACON_MIN, CV_R_BEACON_MAX);
}

export class CVFilter {
  private p = 0;
  private v = 0;
  private P00 = 1;
  private P01 = 0;
  private P10 = 0;
  private P11 = 1;
  private initialized = false;
  private nObs = 0;
  /** EMA of the (clamped) squared innovation — drives the innovFactor of adaptive R. */
  private innovEma = CV_R;

  // Last predict-step internals, exposed so the RTS forward pass can store them.
  lastF: Mat2 = [1, 0, 0, 1];
  lastXPred: Vec2 = [0, 0];
  lastPpred: Mat2 = [1, 0, 0, 1];

  reset(): void {
    this.p = 0; this.v = 0;
    this.P00 = 1; this.P01 = 0; this.P10 = 0; this.P11 = 1;
    this.initialized = false; this.nObs = 0; this.innovEma = CV_R;
    this.lastF = [1, 0, 0, 1]; this.lastXPred = [0, 0]; this.lastPpred = [1, 0, 0, 1];
  }

  get position(): number { return this.p; }
  get xVec(): Vec2 { return [this.p, this.v]; }
  get P(): Mat2 { return [this.P00, this.P01, this.P10, this.P11]; }

  /**
   * @param z             position measurement (model raw y, metres)
   * @param dt            seconds since the previous update
   * @param conf          walking confidence 0..1 (gates accel noise + soft ZUPT)
   * @param beaconFactor  R multiplier from beacon count (see beaconRFactor)
   */
  update(z: number, dt: number, conf: number, beaconFactor: number): number {
    if (!this.initialized) {
      this.p = z; this.v = 0;
      this.P00 = 1; this.P01 = 0; this.P10 = 0; this.P11 = 1;
      this.initialized = true; this.nObs = 1; this.innovEma = CV_R;
      this.lastXPred = [z, 0]; this.lastPpred = [1, 0, 0, 1]; this.lastF = [1, 0, 0, 1];
      return this.p;
    }

    // #6 gap re-init: a long silence makes the stored velocity stale → drop it and
    // inflate the covariance so the next measurement re-acquires cleanly.
    if (dt > CV_GAP_S) {
      this.v = 0;
      this.P00 = 100; this.P01 = 0; this.P10 = 0; this.P11 = 100;
      this.nObs = 1;
    }

    const h = Math.min(CV_DT_MAX, Math.max(CV_DT_MIN, dt));
    // #7 two-observation velocity init: seed v from the first two positions.
    if (this.nObs === 1) this.v = (z - this.p) / h;
    this.nObs++;

    // --- predict ---
    const xPred: Vec2 = [this.p + this.v * h, this.v];
    const F: Mat2 = [1, h, 0, 1];
    // #3 process accel std gated by conf² (stickier stops).
    const accelStd = CV_ACCEL_STILL + (CV_ACCEL_WALK - CV_ACCEL_STILL) * conf * conf;
    const sa2 = accelStd * accelStd;
    const a = this.P00 + h * this.P10;
    const b = this.P01 + h * this.P11;
    const Ppred: Mat2 = [
      a + h * b + (sa2 * h * h * h) / 3,
      b + (sa2 * h * h) / 2,
      this.P10 + h * this.P11 + (sa2 * h * h) / 2,
      this.P11 + sa2 * h,
    ];
    this.lastF = F; this.lastXPred = xPred; this.lastPpred = Ppred;

    // #1 adaptive R + #2 soft innovation gating.
    const innovFactor = clamp(this.innovEma / CV_R, CV_INNOV_CLAMP_LO, CV_INNOV_CLAMP_HI);
    let Rk = CV_R * beaconFactor * innovFactor;
    const innov = z - xPred[0];
    let S = Ppred[0] + Rk;
    if ((innov * innov) / S > CV_GATE_D2) {
      Rk *= CV_GATE_R_INFLATE; // Huber-style down-weight rather than hard-drop
      S = Ppred[0] + Rk;
    }
    // Update the innovation EMA with a CLAMPED ν² so a gated spike can't corrupt R.
    const innov2cap = CV_GATE_D2 * (Ppred[0] + CV_R);
    this.innovEma = CV_INNOV_ALPHA * Math.min(innov * innov, innov2cap) + (1 - CV_INNOV_ALPHA) * this.innovEma;

    // --- update (gain) ---
    const K0 = Ppred[0] / S;
    const K1 = Ppred[2] / S;
    this.p = xPred[0] + K0 * innov;
    this.v = xPred[1] + K1 * innov;

    // #9 Joseph form: P = (I−KH)P⁻(I−KH)ᵀ + K R Kᵀ, H = [1,0], A = I−KH = [[1−K0,0],[−K1,1]].
    const A00 = 1 - K0, A10 = -K1;
    const nP00 = Ppred[0], nP01 = Ppred[1], nP10 = Ppred[2], nP11 = Ppred[3];
    // M = A·P⁻
    const M00 = A00 * nP00, M01 = A00 * nP01;
    const M10 = A10 * nP00 + nP10, M11 = A10 * nP01 + nP11;
    // P = M·Aᵀ + K R Kᵀ   (Aᵀ = [[A00, A10],[0, 1]])
    let P00 = M00 * A00 + Rk * K0 * K0;
    let P01 = M00 * A10 + M01 + Rk * K0 * K1;
    let P10 = M10 * A00 + Rk * K1 * K0;
    let P11 = M10 * A10 + M11 + Rk * K1 * K1;
    // #10 symmetrize (floating point slowly breaks symmetry).
    const off = (P01 + P10) / 2;
    P01 = off; P10 = off;
    this.P00 = P00; this.P01 = P01; this.P10 = P10; this.P11 = P11;

    // #4 dt-independent soft ZUPT: bleed velocity toward 0 when still so the dot
    // holds at a pause; exponential ⇒ decay rate is independent of the tick rate.
    const stillness = 1 - conf;
    if (stillness > 0) this.v *= Math.exp(-(h * stillness) / CV_TAU);

    return this.p;
  }
}
