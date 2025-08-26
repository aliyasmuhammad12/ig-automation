// grip.js
const { rInt, rFloat, clamp, weightedChoice } = require('./utils');
const DEFAULTS = require('./params');

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

/**
 * Compute grip mode based on session state
 */
function computeGripMode(sessionState) {
  // End left mode if needed
  endLeftModeIfNeeded(sessionState);
  
  // Check if we should start left mode
  if (sessionState.gripMode === 'right' && 
      sessionState.nextGripShiftAt && 
      sessionState.swipeCount >= sessionState.nextGripShiftAt) {
    maybeStartLeftMode(sessionState, DEFAULTS);
  }
  
  // Schedule next grip shift if not already scheduled
  if (!sessionState.nextGripShiftAt) {
    scheduleNextGripShift(sessionState, DEFAULTS);
  }
  
  return {
    mode: sessionState.gripMode,
    bias: sessionState.gripMode === 'right' ? sessionState.rightHandBias : sessionState.leftHandBias
  };
}

/**
 * Compute start point based on grip mode and session state
 */
function computeStartPoint(opts) {
  const { vw, vh, startX, startY, gripMode, sessionState } = opts;
  
  // Use provided start point if available
  if (typeof startX === 'number' && typeof startY === 'number') {
    return {
      x: clamp(Math.round(startX), 8, vw - 8),
      y: clamp(Math.round(startY), Math.round(vh * 0.12), vh - 24)
    };
  }
  
  // Compute based on grip mode
  let x, y;
  
  if (gripMode === 'right') {
    // Right hand: bias towards right side
    x = Math.round(vw * sessionState.rightHandBias);
    y = Math.round(vh * 0.74);
  } else {
    // Left hand: bias towards left side
    x = Math.round(vw * sessionState.leftHandBias);
    y = Math.round(vh * 0.74);
  }
  
  // Apply sticky start position if available
  if (sessionState.lastStartX !== null && sessionState.lastStartY !== null) {
    const stickyChance = 0.3; // 30% chance to use sticky position
    if (Math.random() < stickyChance) {
      x = sessionState.lastStartX;
      y = sessionState.lastStartY;
    }
  }
  
  return {
    x: clamp(Math.round(x), 8, vw - 8),
    y: clamp(Math.round(y), Math.round(vh * 0.12), vh - 24)
  };
}

module.exports = {
  scheduleNextGripShift,
  maybeStartLeftMode,
  endLeftModeIfNeeded,
  applyGripShiftIntra,
  computeGripMode,
  computeStartPoint
};
