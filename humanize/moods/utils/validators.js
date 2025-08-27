// Validation utilities for mood system
// Provides input validation to ensure data integrity and prevent errors
// These functions validate dates and mood configurations before processing

/**
 * Validates that a date is a proper Date object and not invalid
 * @param {Date} date - The date to validate
 * @returns {Date} The validated date object
 * @throws {Error} If the date is invalid or not a Date object
 * 
 * This function ensures that:
 * - The input is actually a Date object
 * - The date is valid (not NaN)
 * - The date can be processed by the mood system
 */
function validateDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date provided to mood system');
  }
  return date;
}

/**
 * Validates that a mood configuration object has all required properties
 * @param {Object} config - The mood configuration object to validate
 * @returns {Object} The validated mood configuration
 * @throws {Error} If any required properties are missing
 * 
 * Required properties:
 * - name: The mood name (string)
 * - dwellMultiplier: Multiplier for dwell time (number)
 * - likeMultiplier: Multiplier for like probability (number)
 * - peekMultiplier: Multiplier for peek probability (number)
 * - glanceMultiplier: Multiplier for glance probability (number)
 */
function validateMoodConfig(config) {
  const requiredProps = ['name', 'dwellMultiplier', 'likeMultiplier', 'peekMultiplier', 'glanceMultiplier'];
  
  for (const prop of requiredProps) {
    if (!(prop in config)) {
      throw new Error(`Missing required property: ${prop}`);
    }
  }
  
  return config;
}

module.exports = {
  validateDate,
  validateMoodConfig
};
