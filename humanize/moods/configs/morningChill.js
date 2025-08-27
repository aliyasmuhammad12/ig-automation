// Morning Chill mood configuration
// This mood represents relaxed, slow-paced browsing in the morning
// People are waking up, taking their time, and browsing casually
// Active from 8 AM to 12 PM (morning hours)
const { DWELL, LIKE, PEEK, GLANCE } = require('../../constants/multipliers');

/**
 * Morning Chill Mood Configuration
 * 
 * Behavior Characteristics:
 * - Slow scrolling (25% slower than normal)
 * - High like probability (35% more likely to like)
 * - Low profile peeking (75% less likely to peek)
 * - Low glancing (75% less likely to glance)
 * 
 * This simulates the behavior of someone who is:
 * - Relaxed and taking their time
 * - More appreciative of content (higher likes)
 * - Less likely to explore profiles deeply
 * - Focused on content consumption rather than exploration
 * - In a calm, unhurried state of mind
 */
module.exports = {
  name: 'MorningChill',
  dwellMultiplier: DWELL.SLOW, // delays +20–25%
  likeMultiplier: LIKE.HIGH, // +35%
  peekMultiplier: PEEK.LOW, // -75%
  glanceMultiplier: GLANCE.LOW
};
