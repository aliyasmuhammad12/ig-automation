// Evening Relax Mode mood configuration
const { DWELL, LIKE, PEEK, GLANCE } = require('../../constants/multipliers');

module.exports = {
  name: 'EveningRelaxMode',
  dwellMultiplier: 1.05, // +5%
  likeMultiplier: 1.1, // +10%
  peekMultiplier: 1.1, // +10%
  glanceMultiplier: 1.1
};
