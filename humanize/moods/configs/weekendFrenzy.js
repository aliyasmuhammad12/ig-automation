// Weekend Frenzy mood configuration
// This mood represents high-energy social media activity during weekend evenings
// It overrides all other moods when active and has unique behavior patterns
// Weekend Frenzy is active Friday 8PM-11PM and Saturday 12AM-4AM + 8PM-11PM
const { DWELL, LIKE, PEEK, GLANCE } = require('../../constants/multipliers');

/**
 * Weekend Frenzy Mood Configuration
 * 
 * Behavior Characteristics:
 * - Fast scrolling (40% faster than normal)
 * - High like probability (50% more likely to like)
 * - No profile peeking (0% chance to open profiles)
 * - No glancing (0% chance to glance at profiles)
 * 
 * This simulates the behavior of someone who is:
 * - Highly engaged but in a hurry
 * - More likely to like content quickly
 * - Less likely to explore profiles deeply
 * - Focused on consuming content rapidly
 */
module.exports = {
  name: 'WeekendFrenzy',
  dwellMultiplier: DWELL.FAST, // Scroll speed +40% → shorter dwell
  likeMultiplier: LIKE.VERY_HIGH, // Likes +50%
  peekMultiplier: PEEK.NONE, // 0% chance of opening profiles/comments
  glanceMultiplier: GLANCE.NONE
};
