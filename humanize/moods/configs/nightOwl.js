// Night Owl Stalker mood configuration
const { DWELL, LIKE, PEEK, GLANCE } = require('../../constants/multipliers');

module.exports = {
  name: 'NightOwlStalker',
  dwellMultiplier: DWELL.VERY_SLOW, // +10%
  likeMultiplier: LIKE.HIGH, // +25%
  peekMultiplier: PEEK.HIGH, // +25%
  glanceMultiplier: GLANCE.HIGH
};
