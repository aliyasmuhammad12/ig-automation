// touch.js — micro-latency + timestamp jitter + 90 Hz helper
// Backwards-compatible API:
//   getClient(page)
//   touchStart(client, x, y, opts?)
//   touchMove(client, x, y, opts?)
//   touchEnd(client, opts?)
//
// Optional opts per call:
//   {
//     microLatency: boolean (default true),
//     jitterProb: number 0..1 (probability we apply a tiny sleep; defaults vary per event),
//     maxJitterMs: number (upper bound for sleep and timestamp jitter; defaults vary per event),
//     // Enriched touch payload (optional; sensible defaults applied):
//     force: number 0..1,
//     radiusX: number,
//     radiusY: number,
//     rotationAngle: number,
//     id: number
//   }
//
// Extras exported (for your gesture scheduler):
//   quantizeDelaysToHz(msPerStep[, hz, rng, pacingOpts])
//     - Snaps per-step delays to a target frame rate (default 90 Hz) with subtle sub-frame jitter.
//   resolveTargetHz()
//     - Returns ADSPOWER_HZ || params.framePacing.hz || 90

const DEFAULTS = require('./params');
const { sleep, jitterTimestampMs, rInt } = require('./utils');

// ----------------------------------------------
// Hz helpers
// ----------------------------------------------
function resolveTargetHz() {
  const envHz = parseInt(process.env.ADSPOWER_HZ ?? '', 10);
  if (envHz === 60 || envHz === 90 || envHz === 120) return envHz;

  const cfgHz = DEFAULTS?.framePacing?.hz;
  if (cfgHz === 60 || cfgHz === 90 || cfgHz === 120) return cfgHz;

  return 90;
}

/**
 * Quantize an array of step delays (ms) to a target refresh rate with subtle imperfections.
 * @param {number[]} msPerStep
 * @param {number}   hz                default resolveTargetHz()
 * @param {Function} rng               default Math.random
 * @param {Object}   pacingOpts        { microJitterChance, microJitterMaxMs, dropFrameChance, phaseOffsetMs:[lo,hi] }
 * @returns {number[]} new delays in ms
 */
function quantizeDelaysToHz(
  msPerStep,
  hz = resolveTargetHz(),
  rng = Math.random,
  pacingOpts = {}
) {
  const frame = 1000 / hz;

  const microJitterChance = pacingOpts.microJitterChance ?? 0.15; // 15% of steps
  const microJitterMaxMs  = pacingOpts.microJitterMaxMs  ?? 0.8;  // ±0.8 ms clamp
  const dropFrameChance   = pacingOpts.dropFrameChance   ?? 0.007; // ~0.7% single-frame miss
  const phaseRange        = pacingOpts.phaseOffsetMs     ?? (DEFAULTS?.framePacing?.phaseOffsetMs ?? [0.2, 2.0]);

  const rand = typeof rng === 'function' ? rng : Math.random;
  const tri = () => { const u = rand(); const v = rand(); return u - v; }; // triangular ~centered 0

  const phase = (Array.isArray(phaseRange) && phaseRange.length === 2)
    ? (phaseRange[0] + rand() * Math.max(0, phaseRange[1] - phaseRange[0]))
    : 0;

  return msPerStep.map((ms, i) => {
    let base = Math.round(ms / frame) * frame;
    if (i === 0) base = Math.max(0, base + phase); // tiny initial offset so first step isn't perfectly aligned
    if (rand() < dropFrameChance) base += frame;   // rare single missed frame
    if (rand() < microJitterChance) {
      const j = tri() * (microJitterMaxMs * 0.9);
      // clamp to ±microJitterMaxMs
      base = Math.max(0, base + Math.max(-microJitterMaxMs, Math.min(microJitterMaxMs, j)));
    }
    return base;
  });
}

// ----------------------------------------------
// CDP client
// ----------------------------------------------
async function getClient(page) {
  // Try common runtimes in order: Puppeteer modern, Playwright legacy, Playwright modern
  if (page?.target?.().createCDPSession) return await page.target().createCDPSession(); // Puppeteer
  if (page?._client) return page._client;                                              // Playwright (legacy private prop)
  if (page?.context?.().newCDPSession) return await page.context().newCDPSession(page); // Playwright modern
  throw new Error('Could not acquire CDP session for touch events');
}

// ----------------------------------------------
// Timestamp helpers
// ----------------------------------------------
// Keep original (unused) for compatibility
function _nowSecondsJittered(maxJitterMs) {
  // jitterTimestampMs returns ms; CDP expects seconds
  return jitterTimestampMs(Date.now(), maxJitterMs) / 1000;
}

// Monotonic version to avoid timestamp reversals under jitter/micro-bursts
let lastTsMs = Date.now();
let _phaseApplied = false;
function _nowSecondsJitteredMonotonic(maxJitterMs) {
  const phaseRange = DEFAULTS?.framePacing?.phaseOffsetMs ?? [0.2, 2.0];
  let now = jitterTimestampMs(Date.now(), maxJitterMs);

  // one-time tiny phase offset so the first event isn't laser-aligned
  if (!_phaseApplied && Array.isArray(phaseRange) && phaseRange.length === 2) {
    const phase = phaseRange[0] + Math.random() * Math.max(0, phaseRange[1] - phaseRange[0]);
    now += phase;
    _phaseApplied = true;
  }

  if (now <= lastTsMs) {
    lastTsMs = lastTsMs + 0.1; // +0.1 ms safety increment
  } else {
    lastTsMs = now;
  }
  return lastTsMs / 1000;
}

async function _maybeMicroSleep(enabled, prob, maxMs) {
  if (!enabled) return;
  if (Math.random() < (prob ?? 0)) {
    const ms = rInt(0, Math.max(0, maxMs | 0));
    if (ms > 0) await sleep(ms);
  }
}

// ----------------------------------------------
// Internal: build a rich touch point
// ----------------------------------------------
function _buildTouchPoint(x, y, opts) {
  const force         = (opts.force ?? DEFAULTS?.touch?.force ?? 0.78);
  const radiusX       = (opts.radiusX ?? DEFAULTS?.touch?.radiusX ?? 2);
  const radiusY       = (opts.radiusY ?? DEFAULTS?.touch?.radiusY ?? 2);
  const rotationAngle = (opts.rotationAngle ?? DEFAULTS?.touch?.rotationAngle ?? 0);
  const id            = (opts.id ?? DEFAULTS?.touch?.id ?? 1);

  return { x, y, radiusX, radiusY, rotationAngle, force, id };
}

// ----------------------------------------------
// Public touch API
// ----------------------------------------------
async function touchStart(client, x, y, opts = {}) {
  // small chance/amount of extra latency at gesture start
  const {
    microLatency = true,
    jitterProb = 0.8,
    maxJitterMs = 3,
  } = opts;

  await _maybeMicroSleep(microLatency, jitterProb, maxJitterMs);

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [_buildTouchPoint(x, y, opts)],
    timestamp: _nowSecondsJitteredMonotonic(maxJitterMs),
  });
}

async function touchMove(client, x, y, opts = {}) {
  // during motion allow a slightly higher probability/jitter bound
  const {
    microLatency = true,
    jitterProb = 0.9,
    maxJitterMs = 4,
  } = opts;

  await _maybeMicroSleep(microLatency, jitterProb, maxJitterMs);

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [_buildTouchPoint(x, y, opts)],
    timestamp: _nowSecondsJitteredMonotonic(maxJitterMs),
  });
}

async function touchEnd(client, opts = {}) {
  // ending the gesture tends to be snappier, but keep a touch of jitter
  const {
    microLatency = true,
    jitterProb = 0.7,
    maxJitterMs = 3,
  } = opts;

  await _maybeMicroSleep(microLatency, jitterProb, maxJitterMs);

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
    timestamp: _nowSecondsJitteredMonotonic(maxJitterMs),
  });
}

module.exports = {
  getClient,
  touchStart,
  touchMove,
  touchEnd,
  // helpers for your scheduler/generator
  quantizeDelaysToHz,
  resolveTargetHz,
};
