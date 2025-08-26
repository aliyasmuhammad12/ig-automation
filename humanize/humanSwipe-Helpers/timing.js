// timing.js
// Responsibility: generate per-step delay values (delayMs) for a swipe path,
// optionally injecting extra pauses (e.g., from 'longPause' outlier).
//
// API
// ---
// buildTiming(cfg, DEFAULTS, stepsN, baseTotalMs, jitterRangeMs, outlier?) -> delayArray[]
//
// Inputs:
// - cfg/DEFAULTS can provide:
//     stepJitterMs: [min, max] | number    // random jitter per step (ms)
//     pauseAfterStep: number               // extra pause after a given step index
// - stepsN: number of discrete steps in the swipe
// - baseTotalMs: target swipe duration in milliseconds (before jitter/pauses)
// - jitterRangeMs: [min, max] additional jitter range per step
// - outlier: object from outliers.js (may contain longPause)
//
// Output:
// - An array of length stepsN where each entry is the delay (ms) before the step executes
//
// Usage in path.js:
//   const delays = buildTiming(cfg, DEFAULTS, stepsN, totalMs, [jMin, jMax], OUT);
//   for (let i = 0; i < stepsN; i++) steps[i].delayMs = delays[i];

const { rInt, rFloat } = require('./utils');
const DEFAULTS = require('./params');

// ---- helpers ----------------------------------------------------------------
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

// ---- core -------------------------------------------------------------------
function buildTiming(cfg = {}, DEFAULTS = {}, stepsN = 0, baseTotalMs = 0, jitterRangeMs = [0,0], outlier = {}) {
  const [jMin, jMax] = arrRange(
    coalesce(cfg.stepJitterMs, DEFAULTS.stepJitterMs),
    jitterRangeMs[0] || 0, jitterRangeMs[1] || 0
  );

  // Equal-split base (integer division), may leave a few ms remainder.
  const basePerStep = stepsN > 0 ? Math.floor(baseTotalMs / stepsN) : 0;
  const remainder = stepsN > 0 ? baseTotalMs % stepsN : 0;

  const delays = new Array(stepsN).fill(basePerStep);

  // Distribute remainder ms evenly to early steps (avoid accumulating late)
  for (let i = 0; i < remainder; i++) {
    delays[i] += 1;
  }

  // Apply jitter per step
  for (let i = 0; i < stepsN; i++) {
    if (jMax > 0 || jMin > 0) {
      delays[i] += rInt(jMin, jMax) * (Math.random() < 0.5 ? -1 : 1);
      if (delays[i] < 0) delays[i] = 0; // no negative delay
    }
  }

  // Inject outlier longPause if applicable
  if (outlier && outlier.type === 'longPause' && outlier.pauseMs > 0) {
    const idx = outlier.pauseIdx != null ? outlier.pauseIdx : null;
    if (idx === 0 && stepsN > 0) {
      delays[0] += outlier.pauseMs;
    } else if (idx != null && idx > 0 && idx < stepsN) {
      delays[idx] += outlier.pauseMs;
    }
  }

  // Config-based extra pause (non-outlier)
  const cfgPauseIdx = coalesce(cfg.pauseAfterStep, DEFAULTS.pauseAfterStep, null);
  if (cfgPauseIdx != null && cfgPauseIdx >= 0 && cfgPauseIdx < stepsN) {
    const pauseMs = coalesce(cfg.pauseAfterMs, DEFAULTS.pauseAfterMs, 0);
    delays[cfgPauseIdx] += pauseMs;
  }

  return delays;
}

/**
 * Compute timing for a swipe
 */
function computeTiming(opts) {
  const { sessionState, profileMultipliers, forceOutlier } = opts;
  
  // Get base duration from session state or defaults
  let duration = 400; // Default duration
  
  // Apply profile multipliers
  if (profileMultipliers.durationBuckets) {
    // Use profile-specific duration buckets
    const bucket = profileMultipliers.durationBuckets[0]; // Use first bucket for now
    duration = rFloat(bucket.v[0], bucket.v[1]);
  } else {
    // Use default duration buckets
    const durBuckets = DEFAULTS.durBuckets;
    const bucket = durBuckets[Math.floor(Math.random() * durBuckets.length)];
    duration = rFloat(bucket.range[0], bucket.range[1]);
  }
  
  // Apply outlier if forced
  if (forceOutlier === 'longPause') {
    const pauseRange = DEFAULTS.outlierLongPauseMs;
    const pauseMs = rFloat(pauseRange[0], pauseRange[1]);
    return {
      duration: duration + pauseMs,
      type: 'longPause',
      pauseMs: pauseMs
    };
  }
  
  return {
    duration: duration,
    type: null
  };
}

/**
 * Compute step delay for a specific step
 */
function computeStepDelay(opts) {
  const { index, totalSteps, baseDelay, timingInfo, sessionState } = opts;
  
  // Base delay from frame rate
  let stepDelay = baseDelay;
  
  // Apply micro-jitter
  const microJitterChance = DEFAULTS.framePacing.microJitterChance;
  const microJitterMaxMs = DEFAULTS.framePacing.microJitterMaxMs;
  
  if (Math.random() < microJitterChance) {
    const jitter = rFloat(-microJitterMaxMs, microJitterMaxMs);
    stepDelay += jitter;
  }
  
  // Apply drop frame simulation
  const dropFrameChance = DEFAULTS.framePacing.dropFrameChance;
  if (Math.random() < dropFrameChance) {
    stepDelay += baseDelay; // Skip one frame
  }
  
  return Math.max(1, stepDelay); // Ensure minimum 1ms delay
}

/**
 * Apply micro-jitter to a delay
 */
function applyMicroJitter(delay, sessionState) {
  const microJitterChance = DEFAULTS.framePacing.microJitterChance;
  const microJitterMaxMs = DEFAULTS.framePacing.microJitterMaxMs;
  
  if (Math.random() < microJitterChance) {
    const jitter = rFloat(-microJitterMaxMs, microJitterMaxMs);
    return Math.max(1, delay + jitter);
  }
  
  return delay;
}

module.exports = { 
  buildTiming,
  computeTiming,
  computeStepDelay,
  applyMicroJitter
};
