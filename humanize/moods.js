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
      dwellMultiplier: 1.3, // delays +20–40%
      likeMultiplier: 1.5, // +50%
      peekMultiplier: 0.2, // -80%
      glanceMultiplier: 0.2,
    };
  }

  if (hour >= 12 && hour < 15) {
    // MorningCoffeeScroll
    return {
      name: 'MorningCoffeeScroll',
      dwellMultiplier: 0.7, // scroll rate +30%
      likeMultiplier: 1.5,
      peekMultiplier: 1.0,
      glanceMultiplier: 1.0,
    };
  }

  if (hour >= 15 && hour < 18) {
    // LunchtimeBrowse
    return {
      name: 'LunchtimeBrowse',
      dwellMultiplier: 1.0,
      likeMultiplier: 1.4, // comments/like/profile +40%
      peekMultiplier: 1.4,
      glanceMultiplier: 1.4,
    };
  }

  if (hour >= 18 && hour < 20) {
    // AfternoonDistraction
    return {
      name: 'AfternoonDistraction',
      dwellMultiplier: 1.15, // slower swiping → longer watch
      likeMultiplier: 0.8, // -20%
      peekMultiplier: 0.8,
      glanceMultiplier: 0.8,
    };
  }

  if (hour >= 20 && hour < 23) {
    // EveningRelaxMode
    return {
      name: 'EveningRelaxMode',
      dwellMultiplier: 1.0,
      likeMultiplier: 1.0,
      peekMultiplier: 1.0,
      glanceMultiplier: 1.0,
    };
  }

  // 23–03 NightOwlStalker
  if (hour >= 23 || hour < 3) {
    return {
      name: 'NightOwlStalker',
      dwellMultiplier: 1.0,
      likeMultiplier: 1.5, // +50%
      peekMultiplier: 1.5,
      glanceMultiplier: 1.5,
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


