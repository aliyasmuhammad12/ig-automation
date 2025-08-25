// utils.js
const rFloat = (a, b) => a + Math.random() * (b - a);
const rInt   = (a, b) => Math.floor(rFloat(a, b + 1));
const clamp  = (n, min, max) => Math.max(min, Math.min(max, n));
const lerp   = (a, b, t) => a + (b - a) * t;

const easeOutCubic   = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => (t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2);
const easeInOutQuint = (t) => (t < 0.5 ? 16*t*t*t*t*t : 1 - Math.pow(-2*t + 2, 5) / 2);

function weightedChoice(items) {
  const total = items.reduce((s, it) => s + it.w, 0);
  let roll = Math.random() * total;
  for (const it of items) { if ((roll -= it.w) <= 0) return it.v; }
  return items[items.length - 1].v;
}

const sampleNear = (mean, jMin, jMax) => mean + rFloat(jMin, jMax);

function truncNorm(mu, sd, a, b) {
  let x;
  for (let i = 0; i < 8; i++) {
    const u1 = Math.random() || 1e-6, u2 = Math.random() || 1e-6;
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    x = mu + sd * z; 
    if (x >= a && x <= b) return x;
  }
  return clamp(x ?? mu, a, b);
}

function sampleWeightedPercent(spreads) {
  const r = weightedChoice(spreads.map(s => ({ v: s.range, w: s.w })));
  return rFloat(r[0], r[1]);
}

function mirrorBuckets(buckets) {
  return buckets.map(b => ({ range: [1 - b.range[1], 1 - b.range[0]], w: b.w }));
}

function ar1(nextMean, last, noiseRange, rho = 0.6) {
  const eps = rFloat(-noiseRange, noiseRange);
  return (last == null) 
    ? sampleNear(nextMean, -noiseRange, noiseRange)
    : nextMean + rho * (last - nextMean) + eps;
}
function randLogNormal(muMs, sigma = 0.35) {
  // muMs ~ typical delay in ms; sigma controls spread (heavier tail => more human irregularity)
  const u1 = Math.random() || 1e-6, u2 = Math.random() || 1e-6;
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const factor = Math.exp(sigma * z); // median ~ 1
  const v = muMs * factor;
  return Math.max(1, v);
}

function buildCadenceProfile(durationMs, stepsN, phases, variance = 1.0, burstChance = 0.2, burstSteps = [2, 4]) {
  // phases: [{ startStep, endStep, baseMs }]
  const delays = new Array(stepsN).fill(0);
  for (const p of phases) {
    const s = Math.max(0, Math.min(stepsN - 1, p.startStep));
    const e = Math.max(s, Math.min(stepsN - 1, p.endStep));
    for (let i = s; i <= e; i++) {
      // widen/narrow spread with 'variance'
      delays[i] = randLogNormal(p.baseMs, 0.35 * variance);
    }
  }
  // micro-bursts: a few very short delays later in the swipe
  if (Math.random() < burstChance) {
    const count = rInt(burstSteps[0], burstSteps[1]);
    for (let k = 0; k < count; k++) {
      const idx = rInt(Math.floor(stepsN * 0.55), stepsN - 1);
      delays[idx] = Math.max(2, Math.floor(delays[idx] * 0.35));
    }
  }
  // normalize so sum ≈ durationMs
  const sum = delays.reduce((a, b) => a + b, 0) || 1;
  const scale = durationMs / sum;
  for (let i = 0; i < delays.length; i++) delays[i] = Math.max(1, Math.round(delays[i] * scale));
  return delays;
}

function jitterTimestampMs(baseMs, jitterRangeMs = 3) {
  return baseMs + rFloat(-jitterRangeMs, jitterRangeMs);
}
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

module.exports = {
  rFloat, rInt, clamp, lerp,
  easeOutCubic, easeInOutCubic, easeInOutQuint,
  weightedChoice, sampleNear, truncNorm,
  sampleWeightedPercent, mirrorBuckets, ar1,
  // new helpers:
  randLogNormal, buildCadenceProfile, jitterTimestampMs,
  sleep
};

