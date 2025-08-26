// Moods / time-of-day modifiers
// Returns { name, dwellMultiplier, likeMultiplier, peekMultiplier, glanceMultiplier }
// WeekendFrenzy (Fri/Sat 20:00–04:00) overrides all.

function isWeekendFrenzy(date) {
  const day = date.getDay(); // 0 Sun, 5 Fri, 6 Sat
  const hour = date.getHours();
  if (day === 5) { // Friday 20-23
    return hour >= 20 && hour <= 23;
  }
  if (day === 6) { // Saturday 00-04 and 20-23
    return hour <= 4 || hour >= 20;
  }
  return false;
}

function getMood(date = new Date()) {
  if (isWeekendFrenzy(date)) {
    return {
      name: 'WeekendFrenzy',
      // Scroll speed +40% → shorter dwell
      dwellMultiplier: 0.6,
      // 0% chance of opening profiles/comments (we map to near-zero for safety)
      peekMultiplier: 0,
      glanceMultiplier: 0,
      // Likes +50%
      likeMultiplier: 1.5,
    };
  }

  const hour = date.getHours();

  if (hour >= 8 && hour < 12) {
    // MorningChill
    return {
      name: 'MorningChill',
      dwellMultiplier: 1.25, // delays +20–25% (FIXED: reduced from 1.3)
      likeMultiplier: 1.35, // +35% (FIXED: reduced from 1.5)
      peekMultiplier: 0.25, // -75% (FIXED: increased from 0.2)
      glanceMultiplier: 0.25,
    };
  }

  if (hour >= 12 && hour < 15) {
    // MorningCoffeeScroll
    return {
      name: 'MorningCoffeeScroll',
      dwellMultiplier: 0.95, // scroll rate +5% (FIXED: increased from 0.7)
      likeMultiplier: 1.25, // +25% (FIXED: reduced from 1.5)
      peekMultiplier: 0.85, // -15% (FIXED: reduced from 1.0)
      glanceMultiplier: 0.85,
    };
  }

  if (hour >= 15 && hour < 18) {
    // LunchtimeBrowse
    return {
      name: 'LunchtimeBrowse',
      dwellMultiplier: 1.05, // +5% (FIXED: increased from 1.0)
      likeMultiplier: 1.2, // +20% (FIXED: reduced from 1.4)
      peekMultiplier: 1.2, // +20% (FIXED: reduced from 1.4)
      glanceMultiplier: 1.2,
    };
  }

  if (hour >= 18 && hour < 20) {
    // AfternoonDistraction
    return {
      name: 'AfternoonDistraction',
      dwellMultiplier: 1.1, // +10% (FIXED: reduced from 1.15)
      likeMultiplier: 0.9, // -10% (FIXED: increased from 0.8)
      peekMultiplier: 0.9, // -10% (FIXED: increased from 0.8)
      glanceMultiplier: 0.9,
    };
  }

  if (hour >= 20 && hour < 23) {
    // EveningRelaxMode
    return {
      name: 'EveningRelaxMode',
      dwellMultiplier: 1.05, // +5% (FIXED: increased from 1.0)
      likeMultiplier: 1.1, // +10% (FIXED: increased from 1.0)
      peekMultiplier: 1.1, // +10% (FIXED: increased from 1.0)
      glanceMultiplier: 1.1,
    };
  }

  // 23–03 NightOwlStalker
  if (hour >= 23 || hour < 3) {
    return {
      name: 'NightOwlStalker',
      dwellMultiplier: 1.1, // +10% (FIXED: increased from 1.0)
      likeMultiplier: 1.25, // +25% (FIXED: reduced from 1.5)
      peekMultiplier: 1.25, // +25% (FIXED: reduced from 1.5)
      glanceMultiplier: 1.25,
    };
  }

  // Default
  return {
    name: 'Default',
    dwellMultiplier: 1.0,
    likeMultiplier: 1.0,
    peekMultiplier: 1.0,
    glanceMultiplier: 1.0,
  };
}

module.exports = { getMood };


