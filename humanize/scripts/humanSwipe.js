// humanize/scripts/humanSwipe.js
// Advanced human-like swipe with full integration of all helper modules
// Export: { swipeNext(page, options) }

const DEFAULTS = require('../humanSwipe-Helpers/params');
const session = require('../humanSwipe-Helpers/session');
const path = require('../humanSwipe-Helpers/path');
const timing = require('../humanSwipe-Helpers/timing');
const tremor = require('../humanSwipe-Helpers/tremor');
const outliers = require('../humanSwipe-Helpers/outliers');
const lateral = require('../humanSwipe-Helpers/lateral');
const curviness = require('../humanSwipe-Helpers/curviness');
const grip = require('../humanSwipe-Helpers/grip');
const profiles = require('../humanSwipe-Helpers/profiles');
const touch = require('../humanSwipe-Helpers/touch');
const humanPlay = require('../humanSwipe-Helpers/humanPlay');

const { clamp, rFloat, rInt, lerp } = require('../humanSwipe-Helpers/utils');

// Initialize session if not already done
if (!session.inited) {
  session.resetSession();
}

async function withCDP(page, fn) {
  const client = await page.target().createCDPSession();
  // Ensure touch is truly "mobile-like"
  await client.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 1,
  });
  try {
    return await fn(client);
  } finally {
    try { await client.detach(); } catch {}
  }
}

/**
 * Build advanced human-like swipe path with all features
 */
function buildAdvancedPath(opts) {
  const {
    vw, vh,
    startX, startY,
    sessionState = session,
    profileName = null,
    forceOutlier = null
  } = opts;

  // Update session state
  sessionState.swipeCount++;
  
  // Apply persona/profile adjustments
  const profile = profileName ? profiles.getProfile(profileName) : null;
  const profileMultipliers = profile ? profile.getMultipliers() : {};

  // Determine grip mode and start point
  const gripInfo = grip.computeGripMode(sessionState);
  const startPoint = grip.computeStartPoint({
    vw, vh, startX, startY,
    gripMode: gripInfo.mode,
    sessionState
  });

  // Compute lateral geometry with advanced features
  const lateralInfo = lateral.computeLateralGeometry({
    sessionState,
    profileMultipliers,
    forceOutlier
  });

  // Compute path geometry with curviness
  const curvinessInfo = curviness.computeCurviness({
    sessionState,
    lateralInfo,
    profileMultipliers
  });

  // Compute timing with cadence control
  const timingInfo = timing.computeTiming({
    sessionState,
    profileMultipliers,
    forceOutlier
  });

  // Check for outliers
  const outlierInfo = outliers.checkForOutlier({
    sessionState,
    forceOutlier,
    profileMultipliers
  });

  // Build the actual path
  const pathInfo = path.buildPath({
    startPoint,
    lateralInfo,
    curvinessInfo,
    timingInfo,
    outlierInfo,
    sessionState,
    vw, vh
  });

  // Apply tremor
  const tremorInfo = tremor.applyTremor({
    path: pathInfo.path,
    sessionState,
    profileMultipliers
  });

  // Update session with this swipe's characteristics
  sessionState.lastDur = timingInfo.duration;
  sessionState.lastDrift = lateralInfo.driftPx;
  sessionState.lastDy = pathInfo.dy;
  sessionState.lastStartX = startPoint.x;
  sessionState.lastStartY = startPoint.y;
  sessionState.lastOutlierType = outlierInfo.type;

  // Advance meta-drift
  sessionState.maybeDriftMeta();

  return {
    path: tremorInfo.path,
    duration: timingInfo.duration,
    startPoint,
    lateralInfo,
    curvinessInfo,
    timingInfo,
    outlierInfo,
    tremorInfo,
    gripInfo
  };
}

/**
 * Dispatch swipe with advanced timing and touch simulation
 */
async function dispatchAdvancedSwipe(client, pathInfo, sessionState) {
  const { path, duration, timingInfo } = pathInfo;
  if (!path.length) return;

  const id = 1;
  const frameDelay = 1000 / sessionState.targetHz; // Convert Hz to ms

  // TouchStart with proper timing
  const startTimestamp = Date.now();
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{
      x: path[0].x, y: path[0].y,
      radiusX: 1, radiusY: 1,
      rotationAngle: 0,
      force: 0.85,
      id
    }],
    modifiers: 0,
    timestamp: startTimestamp
  });

  // Moves with cadence control and micro-jitter
  const moves = path.slice(1, -1);
  for (let i = 0; i < moves.length; i++) {
    const p = moves[i];
    const stepDelay = timing.computeStepDelay({
      index: i,
      totalSteps: moves.length,
      baseDelay: frameDelay,
      timingInfo,
      sessionState
    });

    // Apply micro-jitter
    const jitteredDelay = timing.applyMicroJitter(stepDelay, sessionState);

    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: p.x, y: p.y,
        radiusX: 1, radiusY: 1,
        rotationAngle: 0,
        force: humanPlay.computeForce(i, moves.length),
        id
      }],
      modifiers: 0,
      timestamp: startTimestamp + (i + 1) * frameDelay
    });

    // Wait with proper cadence
    await new Promise(r => setTimeout(r, jitteredDelay));
  }

  // TouchEnd
  const endTimestamp = startTimestamp + duration;
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
    modifiers: 0,
    timestamp: endTimestamp
  });
}

/**
 * Main swipe function with full feature integration
 * options:
 *  - startX, startY : optional start point
 *  - profileName : persona/profile name (e.g., 'bored', 'focused', 'distracted')
 *  - forceOutlier : force specific outlier type
 *  - sessionOverride : override session parameters
 */
async function swipeNext(page, options = {}) {
  // 🔍 Use AdsPower's native viewport (no overrides)
  const vp = page.viewport();
  if (!vp) {
    throw new Error('No viewport detected - AdsPower must provide viewport configuration');
  }
  const vw = vp.width;
  const vh = vp.height;

  // Try to start over the video region if possible
  let startX = options.startX, startY = options.startY;
  if (typeof startX !== 'number' || typeof startY !== 'number') {
    try {
      const pt = await page.evaluate(() => {
        const v = document.querySelector('main video[src], div[role="dialog"] video[src]');
        if (v) {
          const r = v.getBoundingClientRect();
          return {
            x: Math.round(r.left + r.width * 0.52),
            y: Math.round(r.top + r.height * 0.74),
          };
        }
        return { x: Math.round(innerWidth * 0.52), y: Math.round(innerHeight * 0.74) };
      });
      startX = pt.x; startY = pt.y;
    } catch {
      startX = Math.round(vw * 0.52);
      startY = Math.round(vh * 0.74);
    }
  }

  // Apply session overrides if provided
  if (options.sessionOverride) {
    Object.assign(session, options.sessionOverride);
  }

  // Set current profile if specified
  if (options.profileName) {
    session.currentProfileName = options.profileName;
  }

  // Build advanced path with all features
  const pathInfo = buildAdvancedPath({
    vw, vh,
    startX, startY,
    sessionState: session,
    profileName: options.profileName,
    forceOutlier: options.forceOutlier
  });

  // Run with CDP
  return withCDP(page, async (client) => {
    // Bring page to front & ensure focus
    try { await client.send('Page.bringToFront'); } catch {}
    try {
      await page.evaluate(() => {
        const v = document.querySelector('main video[src], div[role="dialog"] video[src]');
        v?.focus?.();
      });
    } catch {}

    await dispatchAdvancedSwipe(client, pathInfo, session);
  });
}

// Export the main function and session for external access
module.exports = { 
  swipeNext,
  session, // Allow external access to session state
  resetSession: () => session.resetSession(),
  setProfile: (name) => { session.currentProfileName = name; }
};
