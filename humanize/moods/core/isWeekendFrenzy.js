// Weekend Frenzy check function
// Determines if the current time falls within Weekend Frenzy periods
// Weekend Frenzy is a special mood that overrides all other moods
// It represents high-energy social media activity during weekend evenings
const { isWeekendDay } = require('../utils/timeUtils');
const TIME_RANGES = require('../../constants/timeRanges');

/**
 * Checks if the given date/time is during Weekend Frenzy period
 * @param {Date} date - The date to check for Weekend Frenzy
 * @returns {boolean} True if it's Weekend Frenzy time, false otherwise
 * 
 * Weekend Frenzy Schedule:
 * - Friday: 8:00 PM - 11:59 PM (20:00 - 23:59)
 * - Saturday: 12:00 AM - 4:00 AM (00:00 - 04:00) AND 8:00 PM - 11:59 PM (20:00 - 23:59)
 * 
 * This represents the peak social media activity times during weekends
 * when people are most likely to be active and engaging
 */
function isWeekendFrenzy(date) {
  const day = date.getDay(); // 0=Sunday, 5=Friday, 6=Saturday
  const hour = date.getHours();
  
  // Check if it's Friday evening (8PM-11PM)
  if (day === 5) { // Friday
    return hour >= TIME_RANGES.WEEKEND_FRENZY_FRIDAY.start && 
           hour <= TIME_RANGES.WEEKEND_FRENZY_FRIDAY.end;
  }
  
  // Check if it's Saturday (early morning 12AM-4AM OR evening 8PM-11PM)
  if (day === 6) { // Saturday
    return (hour <= TIME_RANGES.WEEKEND_FRENZY_SATURDAY_DAY.end || 
            hour >= TIME_RANGES.WEEKEND_FRENZY_SATURDAY_NIGHT.start);
  }
  
  // Not weekend frenzy time
  return false;
}

module.exports = { isWeekendFrenzy };
