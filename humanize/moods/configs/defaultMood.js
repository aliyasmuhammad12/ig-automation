// Default mood configuration
const { DWELL, LIKE, PEEK, GLANCE } = require('../../constants/multipliers');

module.exports = {
  name: 'Default',
  dwellMultiplier: DWELL.NORMAL,
  likeMultiplier: LIKE.NORMAL,
  peekMultiplier: PEEK.NORMAL,
  glanceMultiplier: GLANCE.NORMAL
};
