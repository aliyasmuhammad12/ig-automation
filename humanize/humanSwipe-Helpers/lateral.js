// lateral.js — arc geometry with occasional "breaks" and optional burst modes
// Responsibility: compute lateral/arc geometry for a swipe path.
// Produces a compact object with an `offsetAt(t)` function that returns
// the lateral (perpendicular) offset in pixels at progress t ∈ [0,1].
//
// Compatible with path.js: createLateral(cfg, DEFAULTS, meta, dx, dy, stepsN, opts?)
// Returns:
// {
//   slantDir: -1 | 0 | 1,
//   arcMul: number,
//   arcAmp: number,
//   lateralTotal: number,
//   offsetAt(t: number): { ox: number, oy: number }
// }
//
// Reads (optionally) from cfg/DEFAULTS:
// - arcAmpPx: [min, max] | number         // peak perpendicular amplitude
// - slantPx:  [min, max] | number         // total linear drift along vHat
// - slantBias: number in [0,1]            // bias towards right-handed slant
// - curvinessPow: [min, max] | number     // exponent for sin^p
// - arcMul: [min, max] | number           // global curvature multiplier
//
// NEW breaking/variants (all optional; safe defaults if missing):
// - arcBreakChance: number (0..1)         // chance to "break" the normal arc this swipe
// - arcFlipChance: number                 // weight among breaks: flip curvature sign
// - arcSCurveChance: number               // weight among breaks: S-curve (sign flips mid-swipe)
// - arcStraightChance: number             // weight among breaks: nearly straight with tiny mid bump
// - arcFlattenFactorRange: [lo, hi]       // scalar (0..1) for "flatten" variant (lower => straighter)
//
// Optional session burst window (multi-swipe):
// - meta.session.arcBurstUntil: number    // swipe index until which burst stays active
// - meta.session.arcBurstMode: string     // 'flatten' | 'flip' | 'sCurve' | 'straight'
//
// opts may include { curvyMul } to multiply arcMul (e.g., outlier surge).
//
// Notes:
// - Keeps original sinusoidal core but wraps it with "distortedArc" for variants.
// - Fully backward compatible with callers.

const { rFloat } = require('./utils');

// ---- small helpers ---------------------------------------------------------
function coalesce(...vals) {
  const fallback = vals.length ? vals[vals.length - 1] : undefined;
  for (let i = 0; i < vals.length - 1; i++) {
    const v = vals[i];
    if (v !== undefined && v !== null) return v;
  }
  return fallback;
}

function arrRange(val, defA, defB) {
  if (Array.isArray(val) && val.length >= 2) return [val[0], val[1]];
  if (typeof val === 'number') return [val, val];
  return [defA, defB];
}

function norm2(x, y) {
  const m = Math.hypot(x, y) || 1;
  return [x / m, y / m];
}

function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

function smoothstep(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

function pick(a, b, defVal) {
  return (a !== undefined) ? a : (b !== undefined ? b : defVal);
}

function chance(p) {
  return Math.random() < (p || 0);
}

// ---- factory ----------------------------------------------------------------
function createLateral(cfg = {}, DEFAULTS = {}, meta = {}, dx = 0, dy = 0, stepsN = 0, opts = {}) {
  // 1) Direction basis
  const [ux, uy] = norm2(dx, dy);
  const vHat = [-uy, ux]; // perpendicular unit vector

  // 2) Parameter sourcing
  const [arcA, arcB] = arrRange(coalesce(cfg.arcAmpPx, DEFAULTS.arcAmpPx), 6, 28);
  const [slA, slB]   = arrRange(coalesce(cfg.slantPx,  DEFAULTS.slantPx),  -8,  8);
  const [pA, pB]     = arrRange(coalesce(cfg.curvinessPow, DEFAULTS.curvinessPow), 1.0, 2.2);
  const [mA, mB]     = arrRange(coalesce(cfg.arcMul, DEFAULTS.arcMul, meta.arcMul), 0.85, 1.25);

  // Bias for choosing slant direction (0.5 neutral). If undefined, derive a tiny bias from angle.
  const slantBiasRaw = coalesce(cfg.slantBias, DEFAULTS.slantBias, null);
  const angle = Math.atan2(dy, dx); // [-pi,pi]
  const naturalBias = 0.5 + 0.08 * Math.sin(angle * 0.7); // tiny, direction-dependent
  const slantBias = slantBiasRaw == null ? clamp(naturalBias, 0.2, 0.8) : clamp(slantBiasRaw, 0, 1);

  // Short-swipe softener
  const shortMul = stepsN > 0 && stepsN < 10 ? 0.85 : 1.0;

  // Randomized picks
  const baseArcAmp = rFloat(arcA, arcB) * shortMul;
  const lateralTotal = rFloat(slA, slB) * shortMul;
  const pow = rFloat(pA, pB);

  // arc multiplier (meta + random) * optional outlier multiplier
  const baseMul = rFloat(mA, mB) * (meta.arcMul || 1);
  const arcMul = baseMul * (opts.curvyMul || 1);

  // slant direction: -1 | 0 | 1 (allow 0 for "no slant" occasionally)
  const noSlantChance = 0.15 * (1 - Math.min(1, Math.abs(lateralTotal) / 12));
  let slantDir = 0;
  if (Math.random() > noSlantChance) {
    slantDir = Math.random() < slantBias ? 1 : -1;
  }

  // Derive final arc amplitude (scaled by arcMul)
  const arcAmp = baseArcAmp * arcMul;

  // ---- NEW: arc break / burst selection ------------------------------------
  const session = meta && meta.session ? meta.session : null;

  // Read cfg/defaults for breaking behavior (all optional)
  const breakChance        = pick(cfg.arcBreakChance,        DEFAULTS.arcBreakChance,        0.0);
  const flipChance         = pick(cfg.arcFlipChance,         DEFAULTS.arcFlipChance,         0.0);
  const sCurveChance       = pick(cfg.arcSCurveChance,       DEFAULTS.arcSCurveChance,       0.0);
  const straightChance     = pick(cfg.arcStraightChance,     DEFAULTS.arcStraightChance,     0.0);
  const [flatMin, flatMax] = Array.isArray(cfg.arcFlattenFactorRange)
    ? cfg.arcFlattenFactorRange
    : (Array.isArray(DEFAULTS.arcFlattenFactorRange)
        ? DEFAULTS.arcFlattenFactorRange
        : [0.55, 0.85]);

  // Optional session burst window (multi-swipe)
  const burstActive = !!(session && session.arcBurstUntil != null && session.swipeCount <= session.arcBurstUntil);

  // Decide variant
  // Priority: session-driven burst mode -> random break (rare)
  let variant = null; // 'flatten' | 'flip' | 'sCurve' | 'straight' | null
  if (burstActive && session.arcBurstMode) {
    variant = session.arcBurstMode;
  } else if (chance(breakChance)) {
    const weights = [
      ['flip',     Math.max(0, +flipChance)],
      ['sCurve',   Math.max(0, +sCurveChance)],
      ['straight', Math.max(0, +straightChance)],
      // implicit 'flatten' if everything else is zero
    ];
    const sum = weights.reduce((s, [,w]) => s + w, 0);
    if (sum > 0) {
      let roll = Math.random() * sum;
      for (const [name, w] of weights) {
        if ((roll -= w) <= 0) { variant = name; break; }
      }
      if (!variant) variant = 'flatten';
    } else {
      variant = 'flatten';
    }
  }

  // parameters per variant
  const flattenK = (flatMin + Math.random() * Math.max(0, flatMax - flatMin)); // 0..1 (lower => flatter)
  const sCurveBreakT = 0.35 + Math.random() * 0.25; // where sign flips for S-curve (0.35..0.60)

  // Core arc shape (positive 0..1)
  function arcShape(t) {
    t = clamp(t, 0, 1);
    return Math.pow(Math.sin(Math.PI * t), pow);
  }

  // Distortion wrapper: returns signed perpendicular component contribution
  function distortedArc(t) {
    // base positive arc [0..1]
    let a = arcShape(t);

    if (variant === 'flatten') {
      // globally squash the peak -> straighter path
      a *= flattenK; // e.g., 0.55..0.85
    } else if (variant === 'straight') {
      // damp arc heavily early+late, leave a tiny mid bump
      const window =
        (t < 0.2 || t > 0.8) ? 0.15 :
        (t < 0.4 || t > 0.6) ? 0.35 :
        0.5;
      a *= window;
    }

    // sign control (curves left vs right); S-curve flips sign mid path
    let sign = 1;
    if (variant === 'flip') {
      sign = (Math.random() < 0.5 ? -1 : 1); // pick a side once per swipe
    } else if (variant === 'sCurve') {
      sign = (t < sCurveBreakT ? 1 : -1);
    }

    return sign * a;
  }

  // 3) Arc/lateral shape function projected on perpendicular basis
  function offsetAt(t) {
    const a = arcAmp * distortedArc(t);                  // modified arc term (can be flatter/flip/S)
    const l = slantDir * lateralTotal * smoothstep(t);   // monotonic drift along perpendicular
    const perp = a + l;

    // Project onto perpendicular basis
    const ox = vHat[0] * perp;
    const oy = vHat[1] * perp;
    return { ox, oy };
  }

  return {
    slantDir,
    arcMul,
    arcAmp,
    lateralTotal,
    offsetAt
  };
}

module.exports = { createLateral };
