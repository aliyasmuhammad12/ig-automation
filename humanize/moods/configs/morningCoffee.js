// Morning Coffee Scroll mood configuration
const { DWELL, LIKE, PEEK, GLANCE } = require('../../constants/multipliers');

module.exports = {
  name: 'MorningCoffeeScroll',
  dwellMultiplier: 0.95, // scroll rate +5%
  likeMultiplier: LIKE.HIGH, // +25%
  peekMultiplier: 0.85, // -15%
  glanceMultiplier: 0.85
};
