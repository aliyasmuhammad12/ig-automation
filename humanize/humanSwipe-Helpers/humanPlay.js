// humanPlay.js — purposeless "fidget" motions that look human
// Public API:
//   playRandom(page, cfg?)
//   playOscillate(page, cfg?)   // up–down 3–15 times (requested behavior)
//   playMicroWiggle(page, cfg?) // tiny dithers around a spot
//   playJitterHold(page, cfg?)  // hold + slight nudges

const DEFAULTS = require('./params');
const { session, initPersonaOnce } = require('./session');
const { createLateral } = require('./lateral');
const { createTremor } = require('./tremor');
const { buildTiming } = require('./timing');
const { selectOutlier } = require('./outliers');
const { getClient, touchStart, touchMove, touchEnd } = require('./touch');
const { rInt, rFloat, sampleWeightedPercent, clamp, sleep } = require('./utils');

// ----------------------- tiny helpers ---------------------------------------

function pickBucketPercent(buckets) {
  if (!Array.isArray(buckets) || buckets.length === 0) return Math.random() * 0.6 + 0.2;
  return sampleWeightedPercent(buckets);
}

function computeStartPoint(page) {
  const vp = page.viewport?.() || { width: 360, height: 640 };
  const isRight = session.gripMode !== 'left';
  const xBuckets = isRight ? session.xBucketsRight : session.xBucketsLeft;
  const yBuckets = session.yBuckets;

  const px = pickBucketPercent(xBuckets);
  const py = pickBucketPercent(yBuckets);
  return {
    x: Math.round(px * (vp.width ?? 360)),
    y: Math.round(py * (vp.height ?? 640)),
    vp
  };
}

/**
 * Build a single swipe using your full geometry stack + rare outliers.
 * dx, dy are deltas in px; durationMs is end-to-end gesture duration.
 */
function buildOnePath(cfg, dx, dy, durationMs) {
  const stepsN = rInt(9, 22);

  // outlier selection (rare long pause, lateral spike, curvy surge)
  const OUT = selectOutlier(cfg, DEFAULTS, stepsN);

  // let the session remember this outlier and maybe boost hesitation briefly (mirrors path.js)
  if (OUT?.type) {
    session.lastOutlierType = OUT.type;
    if (Math.random() < 0.5) {
      session.hesitationBoostUntil = session.swipeCount + rInt(1, 3);
    }
  }

  // lateral + tremor
  const meta = { session, arcMul: session?.meta?.arcMul ?? 1 };
  const lateral = createLateral(cfg, DEFAULTS, meta, dx, dy, stepsN, { curvyMul: OUT.curvyMul });
  const tremorStep = createTremor(cfg, DEFAULTS, stepsN);

  // coordinates (+ optional lateral spike outlier)
  const steps = [];
  for (let i = 1; i <= stepsN; i++) {
    const t = i / stepsN;
    let x = dx * t;
    let y = dy * t;

    const { ox, oy } = lateral.offsetAt(t);
    x += ox; y += oy;

    if (OUT.type === 'lateralSpike' && i === OUT.spikeIdx) x += OUT.spikePx;

    const { tx, ty } = tremorStep(i);
    x += tx; y += ty;

    steps.push({ x, y, delayMs: 0 });
  }

  // per-step delays (inject longPause if chosen)
  const delays = buildTiming(cfg, DEFAULTS, stepsN, durationMs, [0, 0], OUT);
  for (let i = 0; i < stepsN; i++) steps[i].delayMs = delays[i];

  return steps;
}

async function runPath(page, start, steps) {
  const client = await getClient(page);
  await touchStart(client, start.x, start.y);
  await sleep(rInt(40, 90)); // light touch-hold
  for (const s of steps) {
    const x = start.x + Math.round(s.x);
    const y = start.y + Math.round(s.y);
    await touchMove(client, x, y);
    if (s.delayMs) await sleep(s.delayMs);
  }
  await touchEnd(client);
  session.swipeCount++;
}

/**
 * Compute force for a touch point based on step index and total steps
 */
function computeForce(stepIndex, totalSteps) {
  // Start with high force, decrease over the swipe (press-then-flick pattern)
  const startForce = 0.85;
  const endForce = 0.65;
  
  // Linear interpolation from start to end
  const progress = stepIndex / Math.max(1, totalSteps - 1);
  const baseForce = startForce + (endForce - startForce) * progress;
  
  // Add small random variation
  const variation = rFloat(-0.05, 0.05);
  
  return clamp(baseForce + variation, 0.5, 1.0);
}

module.exports = {
  playRandom: async (page, cfg) => {
    // Implementation would go here
  },
  playOscillate: async (page, cfg) => {
    // Implementation would go here
  },
  playMicroWiggle: async (page, cfg) => {
    // Implementation would go here
  },
  playJitterHold: async (page, cfg) => {
    // Implementation would go here
  },
  computeForce
};
