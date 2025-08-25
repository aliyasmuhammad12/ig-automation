// session.js — meta‑randomness + fixed Hz (AdsPower‑friendly) + arc‑burst helper
// - Keeps DEFAULTS import and original responsibilities
// - Initializes grip-related fields (gripMode, nextGripShiftAt, leftModeUntil)
// - Seeds xBucketsRight from DEFAULTS.rightModeSwipesBuckets and xBucketsLeft as mirror
// - Seeds yBuckets as a cloned copy (computeStartPoint clamps later)
// - Adds fatigueLevel and baseCurvinessScale
// - Adds meta (drifting personality) with tiny random-walk updates
// - Exposes maybeDriftMeta() so callers can advance drift once per swipe
// - Provides resetSession() preserving object identity
// - Sets targetHz to a fixed cadence (default 90 Hz); can be overridden
// - Adds lastStartX/lastStartY for sticky start points
// - NEW: arc-burst fields + helpers (multi-swipe "breaks" for lateral.js variants)

const DEFAULTS = require('./params');
const { clamp, rFloat, rInt } = require('./utils');

// -------- Hz selection (simple & stable) --------
// Priority: ENV (ADSPOWER_HZ) > DEFAULTS.framePacing.hz > fallback 90
function resolveTargetHz() {
  const envHz = parseInt(process.env.ADSPOWER_HZ ?? '', 10);
  if (envHz === 60 || envHz === 90 || envHz === 120) return envHz;

  const cfgHz = DEFAULTS?.framePacing?.hz;
  if (cfgHz === 60 || cfgHz === 90 || cfgHz === 120) return cfgHz;

  return 90; // sensible default for AdsPower if you set it there
}

// Core session state (kept as a stable object; mutate in place on reset)
const session = {
  inited: false,
  swipeCount: 0,

  // hand bias (percent of width)
  rightHandBias: 0.66,
  leftHandBias: 0.34,

  // lateral geometry means
  lateralDriftMeanPx: 24,
  lateralArcMeanPx: 2.1,

  // last-step memory for AR(1)
  lastDur: null,
  lastDrift: null,
  lastDy: null,

  // sticky start memory
  lastStartX: null,
  lastStartY: null,

  // soft state
  recentPeekCount: 0,
  lastPeekAt: null,
  tempoLast: null,

  // grip state
  gripMode: 'right', // 'right' | 'left'
  nextGripShiftAt: null,
  leftModeUntil: null,

  // bucket sets
  xBucketsRight: null,
  xBucketsLeft: null,
  yBuckets: null,

  // realism extras
  fatigueLevel: 0,
  baseCurvinessScale: 1,

  // move cadence target (Hz)
  targetHz: null,

  // curviness override (set by curviness.js)
  curvinessOverride: null,

  // --- meta-randomness (drifting personality) ---
  meta: {
    // multiplicative or additive nudges we’ll apply elsewhere
    curvinessMul: 1.0,   // 0.80 .. 1.25
    hesitationAdd: 0.0,  // -0.08 .. +0.08
    driftPxAdd: 0.0,     // -8 .. +8 (pixels)
    arcMul: 1.0,         // 0.80 .. 1.25
    tremorMul: 1.0,      // 0.80 .. 1.40
    nextDriftAt: null,   // swipe index when we’ll drift again
  },

  // --- context-linked micro-behavior flags (added) ---
  hesitationBoostUntil: null, // swipe index; boost hesitation until this swipe
  lastOutlierType: null,      // 'longPause' | 'lateralSpike' | 'curvySurge' | null
  lastMiss: null,             // swipe index when a "miss" was detected externally
  currentProfileName: null,   // optional: 'bored' | 'engaged' | 'afterLike' | ...

  // --- NEW: arc "burst" (multi-swipe variant window for lateral.js) ---
  arcBurstUntil: null,        // swipe index; burst active while swipeCount <= this
  arcBurstMode: null,         // 'flatten' | 'flip' | 'sCurve' | 'straight' | null
};

// ---- helpers kept at top-level ----
function cloneBuckets(buckets) {
  if (!Array.isArray(buckets)) return [];
  return buckets.map(b => ({ range: [b.range[0], b.range[1]], w: b.w }));
}

function mirrorBuckets(buckets) {
  if (!Array.isArray(buckets)) return [];
  return buckets.map(b => ({ range: [1 - b.range[1], 1 - b.range[0]], w: b.w }));
}

function decayPeekMemory() {
  // decay every 6 swipes to avoid unbounded growth
  if (session.swipeCount > 0 && session.swipeCount % 6 === 0 && session.recentPeekCount > 0) {
    session.recentPeekCount--;
  }
}

// ---- meta-randomness drift helpers ----
function scheduleNextMetaDrift(sessionObj) {
  // drift every ~6–12 swipes (human “mood” shift cadence)
  const inHowMany = rInt(6, 12);
  sessionObj.meta.nextDriftAt = sessionObj.swipeCount + inHowMany;
}

function applyMetaDrift(sessionObj) {
  // tiny random walk, clamped to safe ranges
  const step = (v, dMin, dMax, minV, maxV) =>
    clamp(v + rFloat(dMin, dMax), minV, maxV);

  sessionObj.meta.curvinessMul = step(sessionObj.meta.curvinessMul, -0.03, 0.03, 0.80, 1.25);
  sessionObj.meta.hesitationAdd = step(sessionObj.meta.hesitationAdd, -0.01, 0.01, -0.08, 0.08);
  sessionObj.meta.driftPxAdd = clamp(sessionObj.meta.driftPxAdd + rFloat(-0.8, 0.8), -8, 8);
  sessionObj.meta.arcMul = step(sessionObj.meta.arcMul, -0.02, 0.02, 0.80, 1.25);
  sessionObj.meta.tremorMul = step(sessionObj.meta.tremorMul, -0.03, 0.03, 0.80, 1.40);

  scheduleNextMetaDrift(sessionObj);
}

function maybeDriftMeta(sessionObj) {
  if (!sessionObj.meta) {
    sessionObj.meta = {
      curvinessMul: 1.0,
      hesitationAdd: 0.0,
      driftPxAdd: 0.0,
      arcMul: 1.0,
      tremorMul: 1.0,
      nextDriftAt: null,
    };
  }
  if (sessionObj.meta.nextDriftAt == null) scheduleNextMetaDrift(sessionObj);
  if (sessionObj.swipeCount >= sessionObj.meta.nextDriftAt) applyMetaDrift(sessionObj);
}

// ---- NEW: arc-burst helpers (optional; used by lateral.js if present) ----
function maybeStartArcBurstOnShift(sessionObj, DEFAULTS) {
  const p = DEFAULTS.arcBurstChanceOnShift ?? 0;
  if (Math.random() >= p) return;

  const [nMin, nMax] = (DEFAULTS.arcBurstSwipes || [2, 4]);
  sessionObj.arcBurstUntil = sessionObj.swipeCount + rInt(nMin, nMax);

  // pick a mode for the whole burst (bias toward flatten/flip; tweak as desired)
  const r = Math.random();
  if (r < 0.45) sessionObj.arcBurstMode = 'flatten';
  else if (r < 0.80) sessionObj.arcBurstMode = 'flip';
  else if (r < 0.92) sessionObj.arcBurstMode = 'sCurve';
  else sessionObj.arcBurstMode = 'straight';
}

function endArcBurstIfNeeded(sessionObj) {
  if (sessionObj.arcBurstUntil != null && sessionObj.swipeCount > sessionObj.arcBurstUntil) {
    sessionObj.arcBurstUntil = null;
    sessionObj.arcBurstMode = null;
  }
}

// ---- lifecycle ----
function initPersonaOnce() {
  if (session.inited) return;

  // Lazy requires to avoid circular deps
  const { scheduleNextGripShift } = require('./grip');
  const { maybeStartFlatSessionOnInit } = require('./curviness'); // keep same behavior

  // Seed buckets from DEFAULTS
  const right = Array.isArray(DEFAULTS?.rightModeSwipesBuckets)
    ? cloneBuckets(DEFAULTS.rightModeSwipesBuckets)
    : [];
  session.xBucketsRight = right;
  session.xBucketsLeft  = mirrorBuckets(right);

  // For y we reuse the same spread; computeStartPoint clamps later
  session.yBuckets = cloneBuckets(right);

  // Curviness baseline
  session.baseCurvinessScale = DEFAULTS.curvinessScaleDefault ?? 1;

  // Choose fixed display cadence for this profile/run
  session.targetHz = resolveTargetHz();

  // Initialize grip cadence + optional curviness override
  session.gripMode = 'right';
  scheduleNextGripShift(session, DEFAULTS);
  maybeStartFlatSessionOnInit(session, DEFAULTS);

  // Optionally kick off an initial arc-burst window
  maybeStartArcBurstOnShift(session, DEFAULTS);

  // Initialize meta drift
  session.meta = {
    curvinessMul: 1.0,
    hesitationAdd: 0.0,
    driftPxAdd: 0.0,
    arcMul: 1.0,
    tremorMul: 1.0,
    nextDriftAt: null,
  };
  scheduleNextMetaDrift(session);

  session.inited = true;
}

function resetSession() {
  // Reset in-place to preserve object identity across imports
  Object.keys(session).forEach(k => delete session[k]);
  Object.assign(session, {
    inited: false,
    swipeCount: 0,

    rightHandBias: 0.66,
    leftHandBias: 0.34,

    lateralDriftMeanPx: 24,
    lateralArcMeanPx: 2.1,

    lastDur: null,
    lastDrift: null,
    lastDy: null,

    // sticky start memory
    lastStartX: null,
    lastStartY: null,

    recentPeekCount: 0,
    lastPeekAt: null,
    tempoLast: null,

    gripMode: 'right',
    nextGripShiftAt: null,
    leftModeUntil: null,

    xBucketsRight: null,
    xBucketsLeft: null,
    yBuckets: null,

    fatigueLevel: 0,
    baseCurvinessScale: DEFAULTS.curvinessScaleDefault ?? 1,

    curvinessOverride: null,

    targetHz: null, // will be set on next init

    meta: {
      curvinessMul: 1.0,
      hesitationAdd: 0.0,
      driftPxAdd: 0.0,
      arcMul: 1.0,
      tremorMul: 1.0,
      nextDriftAt: null,
    },

    // context-linked micro-behavior flags (added)
    hesitationBoostUntil: null,
    lastOutlierType: null,
    lastMiss: null,
    currentProfileName: null,

    // arc-burst state
    arcBurstUntil: null,
    arcBurstMode: null,
  });
}

module.exports = {
  session,
  initPersonaOnce,
  resetSession,
  cloneBuckets,
  mirrorBuckets,
  decayPeekMemory,
  // meta drift helpers (call maybeDriftMeta once per swipe)
  scheduleNextMetaDrift,
  applyMetaDrift,
  maybeDriftMeta,
  // new arc-burst helpers (optional for lateral.js variants)
  maybeStartArcBurstOnShift,
  endArcBurstIfNeeded,
};
