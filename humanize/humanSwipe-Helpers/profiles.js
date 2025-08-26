function profileOverrides(name) {
  if (!name) return {};
  switch (name) {
    case 'afterLike':
      return {
        slowSwipeChance: 0.35,
        slowSwipeRange: [420, 700],
        rightSlantChance: 0.985,
        nudgeChance: 0.95,
        lagEventChance: 0.04,
        // new tweaks
        peekChance: 0.20,
        tempoWeights: { fastFlick: 0.22, normal: 0.60, slowDrag: 0.18 },
        hesitationChance: 0.50,
      };
    case 'afterCommentOpen':
      return {
        durationBuckets: [
          { v: [180, 260], w: 6 },
          { v: [140, 190], w: 2 },
          { v: [260, 320], w: 3 },
        ],
        slowSwipeChance: 0.10,
        lagEventChance: 0.12,
        stutterChance: 0.24,
        // new tweaks
        tempoWeights: { fastFlick: 0.12, normal: 0.58, slowDrag: 0.30 },
        hesitationChance: 0.62,
        peekChance: 0.15,
      };
    case 'afterCommentClose':
      return {
        durationBuckets: [
          { v: [140, 200], w: 7 },
          { v: [120, 160], w: 2 },
          { v: [200, 260], w: 1 },
        ],
        slowSwipeChance: 0.03,
        lagEventChance: 0.06,
        nudgeChance: 0.8,
        // new tweaks
        peekChance: 0.14,
        hesitationChance: 0.52,
      };
    case 'engaged':
      return {
        durationBuckets: [
          { v: [170, 240], w: 7 },
          { v: [140, 190], w: 2 },
          { v: [240, 300], w: 2 },
        ],
        slowSwipeChance: 0.08,
        lateralDriftMeanPx: 26,
        // new tweaks
        tempoWeights: { fastFlick: 0.15, normal: 0.58, slowDrag: 0.27 },
        hesitationChance: 0.60,
        peekChance: 0.19,
      };
    case 'bored':
      return {
        durationBuckets: [
          { v: [120, 170], w: 7 },
          { v: [150, 210], w: 2 },
          { v: [210, 260], w: 1 },
        ],
        slowSwipeChance: 0.02,
        lagEventChance: 0.05,
        stutterChance: 0.12,
        // new tweaks
        tempoWeights: { fastFlick: 0.26, normal: 0.60, slowDrag: 0.14 },
        hesitationChance: 0.49,
        peekChance: 0.18,
      };
    case 'afterMiss':
      return {
        durationBuckets: [
          { v: [180, 260], w: 8 },
          { v: [150, 200], w: 2 },
        ],
        swipeDy: [-520, -640],
        lagEventChance: 0.05,
        // new tweaks
        tempoWeights: { fastFlick: 0.23, normal: 0.65, slowDrag: 0.12 },
        hesitationChance: 0.45,
        peekChance: 0.10,
      };
    case 'afterProfileTap':
      return {
        slowSwipeChance: 0.12,
        nudgeChance: 0.9,
        lagEventChance: 0.07,
        // new tweaks
        peekChance: 0.22,
        hesitationChance: 0.56,
      };
    default:
      return {};
  }
}

/**
 * Get profile by name
 */
function getProfile(name) {
  if (!name) return null;
  
  const overrides = profileOverrides(name);
  if (!overrides || Object.keys(overrides).length === 0) return null;
  
  return {
    name,
    overrides,
    getMultipliers: () => overrides
  };
}

/**
 * Get multipliers for a profile
 */
function getMultipliers(profileName) {
  const profile = getProfile(profileName);
  return profile ? profile.getMultipliers() : {};
}

module.exports = {
  profileOverrides,
  getProfile,
  getMultipliers
};
