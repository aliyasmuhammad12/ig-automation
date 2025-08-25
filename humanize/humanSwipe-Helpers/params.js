// params.js
const { clamp } = require('./utils');

module.exports = {
  // ---- frame pacing (used by session.js & touch.js) ----
  // If you want to override from AdsPower, set env ADSPOWER_HZ=60|90|120.
  // Otherwise this config wins.
  framePacing: {
    hz: 90,                  // fixed target refresh for AdsPower
    microJitterChance: 0.15, // chance a step gets ±sub-ms jitter
    microJitterMaxMs: 0.8,   // clamp for sub-frame jitter
    dropFrameChance: 0.007,  // rare single VSync miss
    phaseOffsetMs: [0.2, 2.0]// tiny initial offset for the very first step
  },

  // ---- left hand mode ----
  leftModeEnterChanceOnShift: 0.14,
  leftModeMinSwipes: 2,
  leftModeMaxSwipes: 5,
  leftModeSwipesBuckets: [
    { range: [0.34, 0.44], w: 3 },
    { range: [0.44, 0.54], w: 6 },
    { range: [0.54, 0.64], w: 5 },
    { range: [0.64, 0.74], w: 3 },
  ],

  // ---- tempo / cadence ----
  tempoWeights: [
    { range: [380, 430], w: 3 },
    { range: [430, 480], w: 5 },
    { range: [480, 550], w: 3 },
    { range: [550, 620], w: 2 },
    { range: [620, 740], w: 1 },
  ],
  tempoDecay: 0.82,

  // ---- rare outliers (very low probability) ----
  outlierChance: 0.02, // was 0.032
  outlierWeights: [
    { type: 'longPause', w: 4 },
    { type: 'lateralSpike', w: 3 },
    { type: 'curvySurge', w: 3 },
  ],
  outlierLongPauseMs: [450, 900], // was [650, 1600]
  outlierLateralSpikePx: [12, 28],
  outlierCurvyMul: [1.5, 2.1],

  // ---- curviness ----
  curvinessScaleDefault: 1,
  curvinessFlatScale: 0.5,
  curvinessVeryCurvyScale: 1.7,
  flatSessionChanceOnShift: 0.12,
  veryCurvySessionChanceOnShift: 0.09,
  flatSessionMinSwipes: 2,
  flatSessionMaxSwipes: 4,
  veryCurvySessionMinSwipes: 2,
  veryCurvySessionMaxSwipes: 4,

  // ---- drift/arc ----
  lateralDriftPxBuckets: [
    { range: [12, 18], w: 1 },
    { range: [18, 24], w: 4 },
    { range: [24, 30], w: 3 },
    { range: [30, 38], w: 2 },
  ],
  lateralArcPxBuckets: [
    { range: [1.2, 1.8], w: 2 },
    { range: [1.8, 2.4], w: 4 },
    { range: [2.4, 3.0], w: 3 },
    { range: [3.0, 3.6], w: 1 },
  ],

  // ---- dy adjustments ----
  dyBasePx: 560,
  dyFatigueMin: -3,
  dyFatigueMax: 5,
  dyARCoef: 0.3,
  dyNoisePx: 6,

  // ---- durations (faster) ----
  durBuckets: [
    { range: [300, 360], w: 2 },
    { range: [360, 440], w: 5 },
    { range: [440, 520], w: 3 },
    { range: [520, 600], w: 1 },
  ],
  durSlowBucket: { range: [600, 720], w: 1 }, // was [680, 830]

  // ---- very slow (rare, distracted-long) ----
  verySlowSwipeChance: 0.02,       // ~2% of swipes become very long
  verySlowSwipeRange: [900, 1100], // end-to-end gesture duration in ms

  // ---- hesitation ----
  hesitationChance: 0.18,
  hesitationWindow: [0.35, 0.55],
  hesitationDurFactor: 0.4,

  // ---- tremor ----
  tremorPxRange: [-0.6, 0.6],
  tremorFrequency: 0.12,

  // ---- micro bursts ----
  microBurstChance: 0.08,
  microBurstStepRange: [2, 5],
  microBurstPxRange: [-1, 1],

  // ---- stutter / lag (lighter) ----
  stutterChance: 0.03, // was 0.06
  stutterStepRange: [2, 4],
  stutterDurFactor: 1.8,

  // ---- overshoot / snap back ----
  overshootChance: 0.12,
  overshootPxRange: [4, 12],
  overshootReturnFactor: 0.5,

  // ---- early lift ----
  earlyLiftChance: 0.1,
  earlyLiftStepRange: [2, 4],

  // ---- miss + retry ----
  missChance: 0.04,
  missExtraDelay: [180, 350],

  // ---- grip shift ----
  gripShiftEvery: [8, 14],
  tweakBucketRangeFactor: 0.92,

  // ---- peeking ----
  peekChance: 0.18,
  peekDyFactor: 0.42,

  // ---- buckets ----
  rightModeSwipesBuckets: [
    { range: [0.12, 0.22], w: 2 },
    { range: [0.22, 0.32], w: 4 },
    { range: [0.32, 0.42], w: 3 },
    { range: [0.42, 0.52], w: 2 },
  ],
};

// --- COMPATIBILITY KEYS ---
const flatScale  = module.exports.curvinessFlatScale;
const curvyScale = module.exports.curvinessVeryCurvyScale;
module.exports.flatBurstChanceOnShift  ??= module.exports.flatSessionChanceOnShift;
module.exports.curvyBurstChanceOnShift ??= module.exports.veryCurvySessionChanceOnShift;
module.exports.flatBurstScaleRange     ??= [flatScale * 0.96, flatScale * 1.24];
module.exports.curvyBurstScaleRange    ??= [curvyScale * 0.94, curvyScale * 1.06];
module.exports.flatBurstSwipes         ??= [module.exports.flatSessionMinSwipes, module.exports.flatSessionMaxSwipes];
module.exports.curvyBurstSwipes        ??= [module.exports.veryCurvySessionMinSwipes, module.exports.veryCurvySessionMaxSwipes];
module.exports.flatSessionChance       ??= module.exports.flatSessionChanceOnShift;
module.exports.flatSessionScaleRange   ??= module.exports.flatBurstScaleRange;
module.exports.flatSessionSwipes       ??= module.exports.flatBurstSwipes;

if (!module.exports.gripShiftBuckets) {
  const [lo, hi] = module.exports.gripShiftEvery;
  module.exports.gripShiftBuckets = [
    { range: [lo, Math.floor((2 * lo + hi) / 3)], w: 3 },
    { range: [Math.floor((2 * lo + hi) / 3) + 1, Math.floor((lo + 2 * hi) / 3)], w: 5 },
    { range: [Math.floor((lo + 2 * hi) / 3) + 1, hi], w: 3 },
  ];
}

module.exports.hesitationAtProgress ??= module.exports.hesitationWindow;
module.exports.hesitationMs         ??= [80, 180]; // was [120, 260]
module.exports.microBurstSteps      ??= module.exports.microBurstStepRange;
if (!module.exports.tremorRange && module.exports.tremorPxRange) {
  const [a, b] = module.exports.tremorPxRange;
  module.exports.tremorRange = Math.max(Math.abs(a), Math.abs(b));
}
module.exports.lagEventChance    ??= 0.03;       // was 0.06
module.exports.lagEventsPerSwipe ??= [1, 3];
module.exports.lagPauseMs        ??= [40, 100];  // was [60, 140]
module.exports.lateralDriftJitterPx ??= [-4, 6];
module.exports.lateralArcJitterPx   ??= [-0.9, 0.9];
module.exports.rampInFrac  ??= [0.12, 0.25];
module.exports.rampOutFrac ??= [0.18, 0.28];
module.exports.durationBuckets ??= module.exports.durBuckets;
// compatibility alias for code that expects a "bucket" object
module.exports.durVerySlowBucket ??= { range: module.exports.verySlowSwipeRange, w: 1 };

// --- ADAPTIVE PARAMS ---
module.exports.getAdaptiveParams = function getAdaptiveParams(session = {}) {
  const P = module.exports;
  const out = { ...P };

  const fat   = clamp(session.fatigueLevel ?? 0, 0, 5);
  const dur   = session.lastDur ?? 440;
  const peeks = session.recentPeekCount ?? 0;
  const meta  = session.meta ?? {};

  const speed01 = clamp((dur - 140) / (720 - 140), 0, 1);
  const driftMul = 0.9 + 0.25 * speed01;
  const arcMul   = 0.9 + 0.30 * speed01;
  out.lateralDriftMeanPx = Math.round((P.lateralDriftMeanPx ?? 24) * driftMul + (meta.driftPxAdd ?? 0));
  out.lateralArcMeanPx   = (P.lateralArcMeanPx ?? 2.1) * arcMul * (meta.arcMul ?? 1);

  out.hesitationChance = clamp(P.hesitationChance + 0.01 * fat, 0, 0.85);
  const tremorBase = P.tremorRange ?? Math.max(...P.tremorPxRange.map(Math.abs));
  out.tremorRange  = tremorBase * (1 + 0.10 * fat) * (meta.tremorMul ?? 1);

  // gentler slow bias + lower cap
  const slowBias = 0.008 * fat + (speed01 > 0.7 ? 0.01 : 0);
  out.slowSwipeChance = clamp((P.slowSwipeChance ?? 0) + slowBias, 0, 0.18);
  out.slowSwipeRange  = P.slowSwipeRange ?? (P.durSlowBucket?.range ?? [600, 720]);

  const fastStreak = dur < 220 ? 1 : 0;
  out.microBurstChance = clamp(P.microBurstChance + 0.03 * fastStreak, 0, 0.25);
  out.lagEventChance   = clamp(P.lagEventChance + 0.01 * fat, 0, 0.15);

  if (peeks >= 2) {
    out.peekChance = clamp(P.peekChance + 0.06, 0, 0.5);
    if (!out.swipeDy) out.swipeDy = [-540, -620];
  }

  out.outlierChance = clamp(P.outlierChance * (1 + 0.15 * (fat >= 3 ? 1 : 0)), 0, 0.06);

  const metaCurvy = meta.curvinessMul ?? 1;
  const curvyNudge = metaCurvy > 1.05 ? 0.02 : metaCurvy < 0.95 ? -0.02 : 0;
  out.curvyBurstChanceOnShift = clamp(P.curvyBurstChanceOnShift + curvyNudge, 0, 0.2);
  out.flatBurstChanceOnShift  = clamp(P.flatBurstChanceOnShift - curvyNudge, 0, 0.25);

  // expose very-slow swipe controls to the runtime
  const baseVerySlow = P.verySlowSwipeChance ?? 0.02;
  // tiny fatigue nudge; capped very small
  const verySlowFatigueNudge = (fat >= 4 ? 0.002 : 0);
  out.verySlowSwipeChance = clamp(baseVerySlow + verySlowFatigueNudge, 0, Math.max(0.04, baseVerySlow));
  out.verySlowSwipeRange  = P.verySlowSwipeRange ?? [900, 1100];

  // --- CONTEXT-LINKED MICRO BEHAVIORS (added) ---

  // 1) Hesitation chaining after an outlier
  if (session.hesitationBoostUntil != null && session.swipeCount <= session.hesitationBoostUntil) {
    out.hesitationChance = clamp((out.hesitationChance ?? P.hesitationChance ?? 0.18) + 0.08, 0, 0.9);
  }

  // 2) Slightly higher tremor when in left-hand mode (assuming right-handed baseline)
  if (session.gripMode === 'left') {
    const tBaseFromOut   = out.tremorRange;
    const tBaseFromParam = P.tremorRange ?? (Array.isArray(P.tremorPxRange) ? Math.max(...P.tremorPxRange.map(Math.abs)) : 0.6);
    const tremBase = tBaseFromOut ?? tBaseFromParam;
    out.tremorRange = tremBase * 1.10;
  }

  // 3) Peek-after-peek chaining (if last peek was the immediately previous swipe)
  if (session.lastPeekAt != null && (session.swipeCount - session.lastPeekAt) <= 1) {
    out.peekChance = clamp((out.peekChance ?? P.peekChance ?? 0.18) + 0.12, 0, 0.6);
  }

  // 4) Microburst tendency immediately after a miss
  if (session.lastMiss != null && (session.swipeCount - session.lastMiss) <= 1) {
    out.microBurstChance = clamp((out.microBurstChance ?? P.microBurstChance ?? 0.08) + 0.15, 0, 0.4);
  }

  // 5) Overshoot bias when bored
  if (session.currentProfileName === 'bored') {
    out.overshootChance = clamp((out.overshootChance ?? P.overshootChance ?? 0.12) + 0.10, 0, 0.4);
  }

  return out;
};
