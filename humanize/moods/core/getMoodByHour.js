// Hour-based mood selection function
// Determines which mood should be active based on the current hour
// Each mood represents different human behavior patterns throughout the day
// This function handles all regular time-based moods (not Weekend Frenzy)
const TIME_RANGES = require('../../constants/timeRanges');

// Import all mood configurations
const weekendFrenzy = require('../configs/weekendFrenzy');
const morningChill = require('../configs/morningChill');
const morningCoffee = require('../configs/morningCoffee');
const lunchtimeBrowse = require('../configs/lunchtimeBrowse');
const afternoonDistract = require('../configs/afternoonDistract');
const eveningRelax = require('../configs/eveningRelax');
const nightOwl = require('../configs/nightOwl');
const defaultMood = require('../configs/defaultMood');

/**
 * Selects the appropriate mood based on the current hour
 * @param {number} hour - The hour of the day (0-23)
 * @returns {Object} Mood configuration object
 * 
 * Mood Schedule:
 * - 8-12 AM: MorningChill (slow, relaxed browsing)
 * - 12-3 PM: MorningCoffeeScroll (moderate activity)
 * - 3-6 PM: LunchtimeBrowse (active browsing)
 * - 6-8 PM: AfternoonDistraction (distracted, less engaged)
 * - 8-11 PM: EveningRelaxMode (relaxed evening browsing)
 * - 11 PM-3 AM: NightOwlStalker (late night activity)
 * - 3-8 AM: Default (low activity period)
 * 
 * Each mood has different multipliers for dwell time, likes, peeks, and glances
 * to simulate realistic human behavior patterns
 */
function getMoodByHour(hour) {
  // Morning chill period (8 AM - 12 PM)
  // People are waking up, taking their time, relaxed browsing
  if (hour >= TIME_RANGES.MORNING.start && hour < TIME_RANGES.MORNING.end) {
    return morningChill;
  }

  // Morning coffee scroll period (12 PM - 3 PM)
  // People are more active, moderate engagement
  if (hour >= TIME_RANGES.MORNING_COFFEE.start && hour < TIME_RANGES.MORNING_COFFEE.end) {
    return morningCoffee;
  }

  // Lunchtime browse period (3 PM - 6 PM)
  // Active browsing during lunch breaks
  if (hour >= TIME_RANGES.LUNCHTIME.start && hour < TIME_RANGES.LUNCHTIME.end) {
    return lunchtimeBrowse;
  }

  // Afternoon distraction period (6 PM - 8 PM)
  // People are getting tired, less engaged
  if (hour >= TIME_RANGES.AFTERNOON.start && hour < TIME_RANGES.AFTERNOON.end) {
    return afternoonDistract;
  }

  // Evening relax mode (8 PM - 11 PM)
  // Relaxed evening browsing
  if (hour >= TIME_RANGES.EVENING.start && hour < TIME_RANGES.EVENING.end) {
    return eveningRelax;
  }

  // Night owl stalker (11 PM - 3 AM)
  // Late night activity, high engagement
  if (hour >= TIME_RANGES.NIGHT.start || hour < TIME_RANGES.NIGHT.end) {
    return nightOwl;
  }

  // Default mood (3 AM - 8 AM)
  // Low activity period, minimal engagement
  return defaultMood;
}

module.exports = { getMoodByHour };
