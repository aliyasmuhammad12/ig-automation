// humanPlay.js — purposeless “fidget” motions that look human
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

// ----------------------- play patterns --------------------------------------

/**
 * Up/down oscillation with human-ish variety:
 * - 3–15 passes, alternating dy sign
 * - distance & duration vary per pass
 * - occasional mid-sequence pause or tiny corrective flick
 */
async function playOscillate(page, cfg = {}) {
  initPersonaOnce();

  const { x, y, vp } = computeStartPoint(page);
  let anchor = { x, y };

  const passes = rInt(3, 15);
  let dir = Math.random() < 0.5 ? -1 : 1; // start up or down

  for (let i = 0; i < passes; i++) {
    const dyMag = rInt(90, Math.max(120, Math.floor(vp.height * 0.38)));
    const dy = dir * dyMag;

    // faster for small swipes, slower for big ones (log-normal flavour)
    const baseDur = clamp(Math.round(150 + dyMag * rFloat(1.5, 2.6)), 140, 980);

    const steps = buildOnePath(cfg, 0, dy, baseDur);
    await runPath(page, anchor, steps);

    // 25%: brief pause like "hmm"
    if (Math.random() < 0.25) await sleep(rInt(140, 420));

    // 18%: tiny corrective flick back
    if (Math.random() < 0.18) {
      const tinyDy = -dir * rInt(18, 45);
      const tinyDur = rInt(120, 240);
      const tiny = buildOnePath(cfg, 0, tinyDy, tinyDur);
      // start where we *ended* last swipe (feels continuous)
      const lastEnd = { x: anchor.x, y: anchor.y + Math.round(dy) };
      await runPath(page, lastEnd, tiny);
      if (Math.random() < 0.35) await sleep(rInt(80, 220));
    }

    dir *= -1;
  }
}

/**
 * Tiny dithers around the same spot (like bored fidgeting).
 */
async function playMicroWiggle(page, cfg = {}) {
  initPersonaOnce();
  const { x, y } = computeStartPoint(page);
  const anchor = { x, y };
  const n = rInt(6, 18);
  let dir = Math.random() < 0.5 ? -1 : 1;

  for (let i = 0; i < n; i++) {
    const dy = dir * rInt(8, 28);
    const dx = rInt(-8, 8);
    const dur = rInt(80, 180);
    const steps = buildOnePath(cfg, dx, dy, dur);
    await runPath(page, anchor, steps);
    if (Math.random() < 0.3) await sleep(rInt(60, 180));
    dir *= -1;
  }
}

/**
 * Idle “hold” with light jitter and sporadic small nudges.
 */
async function playJitterHold(page, cfg = {}) {
  initPersonaOnce();
  const { x, y } = computeStartPoint(page);
  const anchor = { x, y };

  const bursts = rInt(2, 5);
  for (let b = 0; b < bursts; b++) {
    const dy = rInt(-22, 22);
    const dx = rInt(-10, 10);
    const dur = rInt(240, 600);
    const steps = buildOnePath(cfg, dx, dy, dur);
    await runPath(page, anchor, steps);
    await sleep(rInt(200, 700));
  }
}

// ----------------------- router ---------------------------------------------

async function playRandom(page, cfg = {}) {
  const r = Math.random();
  if (r < 0.55) return playOscillate(page, cfg);
  if (r < 0.82) return playMicroWiggle(page, cfg);
  return playJitterHold(page, cfg);
}

module.exports = {
  playRandom,
  playOscillate,
  playMicroWiggle,
  playJitterHold,
};
