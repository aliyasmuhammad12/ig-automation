// Moods / time-of-day modifiers
// Returns { name, dwellMultiplier, likeMultiplier, peekMultiplier, glanceMultiplier }
// WeekendFrenzy (Fri/Sat 20:00–04:00) overrides all.

// Main entry point - imports from refactored structure
const { getMood } = require('./moods/core/getMood');

// Maintain exact same exports for backward compatibility
module.exports = { getMood };


