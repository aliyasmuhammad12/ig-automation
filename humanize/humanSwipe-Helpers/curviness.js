// curviness.js — meta‑aware
const { rInt, rFloat, clamp } = require('./utils');

function startCurvinessOverride(session, scale, swipes) {
  session.curvinessOverride = { scale, until: session.swipeCount + swipes };
}

function expireCurvinessIfDone(session) {
  if (session.curvinessOverride && session.swipeCount >= session.curvinessOverride.until) {
    session.curvinessOverride = null;
  }
}

function maybeStartCurvinessBurstOnShift(session, DEFAULTS) {
  if (session.curvinessOverride) return;
  const roll = Math.random();

  // keep existing behavior; these DEFAULTS keys may or may not exist depending on your params
  if (roll < DEFAULTS.flatBurstChanceOnShift) {
    const [sMin, sMax] = DEFAULTS.flatBurstScaleRange;
    const [nMin, nMax] = DEFAULTS.flatBurstSwipes;
    startCurvinessOverride(session, rFloat(sMin, sMax), rInt(nMin, nMax));
  } else if (roll < DEFAULTS.flatBurstChanceOnShift + DEFAULTS.curvyBurstChanceOnShift) {
    const [sMin, sMax] = DEFAULTS.curvyBurstScaleRange;
    const [nMin, nMax] = DEFAULTS.curvyBurstSwipes;
    startCurvinessOverride(session, rFloat(sMin, sMax), rInt(nMin, nMax));
  }
}

function maybeStartFlatSessionOnInit(session, DEFAULTS) {
  if (Math.random() < DEFAULTS.flatSessionChance) {
    const [sMin, sMax] = DEFAULTS.flatSessionScaleRange;
    const scale = rFloat(sMin, sMax);
    const [nMin, nMax] = DEFAULTS.flatSessionSwipes;
    startCurvinessOverride(session, scale, rInt(nMin, nMax));
  }
}

function currentCurviness(session, cfg, DEFAULTS) {
  // 1) compute what we would have used (override > explicit cfg > base > default)
  const base = cfg.curvinessScale ?? session.baseCurvinessScale ?? DEFAULTS.curvinessScaleDefault;
  const chosen = (session.curvinessOverride?.scale ?? base);

  // 2) apply meta multiplier (drifting personality)
  const metaMul = session?.meta?.curvinessMul ?? 1.0;

  // 3) clamp to a conservative envelope to avoid extremes if params misalign
  // Pick a range around your typical values; adjust if you want wider variety.
  const minAllowed = Math.min(
    DEFAULTS.curvinessFlatScale ?? 0.5,
    0.45
  );
  const maxAllowed = Math.max(
    DEFAULTS.curvinessVeryCurvyScale ?? 1.7,
    1.9
  );

  return clamp(chosen * metaMul, minAllowed, maxAllowed);
}

module.exports = {
  startCurvinessOverride,
  expireCurvinessIfDone,
  maybeStartCurvinessBurstOnShift,
  maybeStartFlatSessionOnInit,
  currentCurviness
};
