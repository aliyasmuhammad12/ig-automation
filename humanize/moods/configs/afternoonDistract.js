// Afternoon Distraction mood configuration
const { DWELL, LIKE, PEEK, GLANCE } = require('../../constants/multipliers');

module.exports = {
  name: 'AfternoonDistraction',
  dwellMultiplier: DWELL.VERY_SLOW, // +10%
  likeMultiplier: LIKE.LOW, // -10%
  peekMultiplier: 0.9, // -10%
  glanceMultiplier: 0.9
};
