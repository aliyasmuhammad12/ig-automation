// Time utility functions for mood system
// Provides helper functions for time-based operations and calculations
// These utilities help determine time ranges and extract time components
const TIME_RANGES = require('../../constants/timeRanges');

/**
 * Extracts the hour component from a Date object
 * @param {Date} date - The date to extract hour from
 * @returns {number} The hour (0-23)
 * 
 * This is a simple utility to get the hour for mood calculations
 * Used throughout the mood system to determine which mood should be active
 */
function getHourFromDate(date) {
  return date.getHours();
}

/**
 * Checks if a given hour falls within a specified time range
 * @param {number} hour - The hour to check (0-23)
 * @param {Object} range - The time range object with start and end properties
 * @returns {boolean} True if hour is within range, false otherwise
 * 
 * Handles both regular ranges (e.g., 8-12) and overnight ranges (e.g., 23-3)
 * For overnight ranges, it checks if hour >= start OR hour < end
 * For regular ranges, it checks if hour >= start AND hour < end
 */
function isInTimeRange(hour, range) {
  if (range.start <= range.end) {
    // Regular range (e.g., 8-12, 14-18)
    return hour >= range.start && hour < range.end;
  } else {
    // Overnight range (e.g., 23-3, 22-6)
    return hour >= range.start || hour < range.end;
  }
}

/**
 * Checks if a given date falls on a weekend day (Friday or Saturday)
 * @param {Date} date - The date to check
 * @returns {boolean} True if it's Friday or Saturday, false otherwise
 * 
 * Used for Weekend Frenzy calculations
 * Friday (day 5) and Saturday (day 6) are considered weekend days
 * Sunday (day 0) is not included as Weekend Frenzy doesn't apply
 */
function isWeekendDay(date) {
  const day = date.getDay();
  return day === 5 || day === 6; // Friday or Saturday
}

module.exports = {
  getHourFromDate,
  isInTimeRange,
  isWeekendDay
};
