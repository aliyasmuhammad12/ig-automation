// Main mood function - orchestrates the entire mood system
// This is the primary entry point that coordinates all mood logic
// Takes a date parameter and returns the appropriate mood configuration
// Weekend Frenzy overrides all other moods when active
const { isWeekendFrenzy } = require('./isWeekendFrenzy');
const { getMoodByHour } = require('./getMoodByHour');
const { validateDate } = require('../utils/validators');
const { getHourFromDate } = require('../utils/timeUtils');
const weekendFrenzy = require('../configs/weekendFrenzy');

/**
 * Main mood function that determines the current mood based on time
 * @param {Date} date - The date/time to get mood for (defaults to current time)
 * @returns {Object} Mood configuration object with name and multipliers
 * 
 * Priority order:
 * 1. Weekend Frenzy (overrides everything)
 * 2. Hour-based mood (MorningChill, EveningRelaxMode, etc.)
 * 3. Default mood (fallback)
 */
function getMood(date = new Date()) {
  // Validate input to ensure we have a proper Date object
  const validatedDate = validateDate(date);
  
  // Check for Weekend Frenzy first (this overrides all other moods)
  // Weekend Frenzy is active Friday 8PM-11PM and Saturday 12AM-4AM + 8PM-11PM
  if (isWeekendFrenzy(validatedDate)) {
    return weekendFrenzy;
  }

  // Get the current hour from the validated date
  const hour = getHourFromDate(validatedDate);
  
  // Return the appropriate mood based on the hour
  // This handles all regular time-based moods (MorningChill, EveningRelaxMode, etc.)
  return getMoodByHour(hour);
}

module.exports = { getMood };
