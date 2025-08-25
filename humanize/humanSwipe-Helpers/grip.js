// grip.js
const { rInt, rFloat, clamp, weightedChoice } = require('./utils');

function scheduleNextGripShift(session, DEFAULTS) {
  const [a, b] = weightedChoice(
    DEFAULTS.gripShiftBuckets.map(bucket => ({ v: bucket.range, w: bucket.w }))
  );
  session.nextGripShiftAt = session.swipeCount + rInt(a, b);
}

function maybeStartLeftMode(session, DEFAULTS) {
  session.gripMode = 'left';
  const [a, b] = weightedChoice(
    DEFAULTS.leftModeSwipesBuckets.map(bucket => ({ v: bucket.range, w: bucket.w }))
  );
  const run = rInt(a, b);
  session.leftModeUntil = session.swipeCount + run;
  session.leftHandBias = clamp(0.34 + rFloat(-0.025, 0.025), 0.2, 0.45);
}

function endLeftModeIfNeeded(session) {
  if (session.gripMode === 'left' && session.swipeCount >= session.leftModeUntil) {
    session.gripMode = 'right';
    session.leftModeUntil = null;
  }
}

function tweakBuckets(buckets) {
  const adj = 0.02; // tighten/loosen inner bucket a touch
  const b = buckets[0];
  const [a, c] = b.range;
  const mid = (a + c) / 2;
  const half = (c - a) / 2;
  const sign = Math.random() < 0.7 ? -1 : 1; // mostly tighten
  const newHalf = clamp(half + sign * adj, 0.02, 0.18);
  b.range = [mid - newHalf, mid + newHalf];
}

function applyGripShiftIntra(session) {
  const delta = rFloat(-0.04, 0.04);
  if (session.gripMode === 'right') {
    session.rightHandBias = clamp(session.rightHandBias + delta, 0.55, 0.8);
    tweakBuckets(session.xBucketsRight);
  } else {
    session.leftHandBias = clamp(session.leftHandBias + delta, 0.2, 0.45);
    tweakBuckets(session.xBucketsLeft);
  }
  tweakBuckets(session.yBuckets);
}

module.exports = {
  scheduleNextGripShift,
  maybeStartLeftMode,
  endLeftModeIfNeeded,
  applyGripShiftIntra
};
