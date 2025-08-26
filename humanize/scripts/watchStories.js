// humanize/scripts/watchStories.js
// Story watching automation with Story Credits (SC) system and mood integration

const { getMood } = require('../moods');

const now = () => Date.now();
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const rFloat = (a, b) => a + Math.random() * (b - a);
const rInt = (a, b) => Math.floor(rFloat(a, b + 1));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

// ============================================================================
// STORY CREDITS (SC) SYSTEM - Core Implementation
// ============================================================================

// Story Credits ranges by mood (from spec)
const SC_RANGES = {
  Casual: { min: 8, max: 18 },
  Focused: { min: 18, max: 35 },
  Binge: { min: 35, max: 60 }
};

// Starting fatigue by mood (from spec)
const STARTING_FATIGUE = {
  Casual: 0.20,
  Focused: 0.12,
  Binge: 0.08
};

// SC consumption by slide category (from spec)
const SC_COSTS = {
  quickScan: { min: 0.5, max: 0.8 },
  normalWatch: { min: 1.0, max: 1.4 },
  longWatch: { min: 1.6, max: 2.2 },
  backReplay: { min: 0.6, max: 1.0 }
};

// Fatigue increments by slide category (from spec)
const FATIGUE_INCREMENTS = {
  quickScan: { min: 0.012, max: 0.018 },
  normalWatch: { min: 0.020, max: 0.030 },
  longWatch: { min: 0.030, max: 0.045 }
};

// Mood fatigue multipliers (from spec)
const FATIGUE_MULTIPLIERS = {
  Casual: 1.0,
  Focused: 0.7,
  Binge: 0.5
};

// ============================================================================
// MOOD INTEGRATION WITH EXISTING SYSTEM
// ============================================================================

function getStoryMood(date = new Date()) {
  const hour = date.getHours();
  
  // Story-specific moods that combine with reels moods
  if (hour >= 6 && hour < 10) {
    return {
      name: 'MorningStoryCasual',
      emojiMultiplier: 0.6,
      storySpeedMultiplier: 1.2,
      reactionChance: 0.15,
      scMultiplier: 0.8, // Less SC in morning
      fatigueMultiplier: 1.2, // More fatigue in morning
    };
  }
  
  if (hour >= 10 && hour < 14) {
    return {
      name: 'MiddayStoryFocused',
      emojiMultiplier: 0.8,
      storySpeedMultiplier: 0.9,
      reactionChance: 0.25,
      scMultiplier: 1.0, // Normal SC
      fatigueMultiplier: 1.0, // Normal fatigue
    };
  }
  
  if (hour >= 14 && hour < 18) {
    return {
      name: 'AfternoonStoryEngaged',
      emojiMultiplier: 1.1,
      storySpeedMultiplier: 0.8,
      reactionChance: 0.35,
      scMultiplier: 1.2, // More SC in afternoon
      fatigueMultiplier: 0.9, // Less fatigue
    };
  }
  
  if (hour >= 18 && hour < 22) {
    return {
      name: 'EveningStoryBinge',
      emojiMultiplier: 1.3,
      storySpeedMultiplier: 0.7,
      reactionChance: 0.45,
      scMultiplier: 1.4, // Most SC in evening
      fatigueMultiplier: 0.7, // Least fatigue
    };
  }
  
  if (hour >= 22 || hour < 2) {
    return {
      name: 'NightStoryCasual',
      emojiMultiplier: 0.7,
      storySpeedMultiplier: 1.1,
      reactionChance: 0.2,
      scMultiplier: 0.9, // Slightly less SC at night
      fatigueMultiplier: 1.1, // Slightly more fatigue
    };
  }
  
  // Late night
  return {
    name: 'LateNightStoryFocused',
    emojiMultiplier: 0.9,
    storySpeedMultiplier: 0.85,
    reactionChance: 0.3,
    scMultiplier: 1.0, // Normal SC
    fatigueMultiplier: 1.0, // Normal fatigue
  };
}

// ============================================================================
// SESSION STATE MANAGEMENT
// ============================================================================

class StorySession {
  constructor(accountId, durationSeconds = 60) {
    this.accountId = accountId;
    this.durationSeconds = durationSeconds;
    this.startTime = now();
    
    // Initialize logging first
    this.logs = [];
    
    // Get moods (double moody system)
    this.reelsMood = getMood();
    this.storyMood = getStoryMood();
    
    // Determine base mood for SC system
    this.baseMood = this.determineBaseMood();
    
    // Initialize SC and fatigue
    this.sc = this.initializeSC();
    this.fatigue = this.initializeFatigue();
    
    // Session state
    this.queue = []; // Accounts with unseen stories
    this.currentAccount = null;
    this.currentUSC = 0; // Unseen slide count
    this.currentMode = null;
    this.slidesWatched = 0;
    this.reactionsSent = 0;
    this.reactionSentThisSession = false;
    this.reactionSentThisAccount = false;
    this.handedness = Math.random() < 0.5 ? 'left' : 'right';
    
    // Session end tracking
    this.endReason = null;
    
    this.logSessionStart();
  }
  
  determineBaseMood() {
    // Map story mood to SC mood based on engagement level
    const moodMap = {
      'MorningStoryCasual': 'Casual',
      'MiddayStoryFocused': 'Focused', 
      'AfternoonStoryEngaged': 'Focused',
      'EveningStoryBinge': 'Binge',
      'NightStoryCasual': 'Casual',
      'LateNightStoryFocused': 'Focused'
    };
    
    return moodMap[this.storyMood.name] || 'Casual';
  }
  
  initializeSC() {
    const range = SC_RANGES[this.baseMood];
    const baseSC = rInt(range.min, range.max);
    
    // Apply story mood multiplier
    const adjustedSC = Math.round(baseSC * this.storyMood.scMultiplier);
    
    this.log(`[SC] Initialized: ${adjustedSC} SC (base: ${baseSC}, mood: ${this.baseMood}, multiplier: ${this.storyMood.scMultiplier.toFixed(2)})`);
    return adjustedSC;
  }
  
  initializeFatigue() {
    const baseFatigue = STARTING_FATIGUE[this.baseMood];
    const adjustedFatigue = baseFatigue * this.storyMood.fatigueMultiplier;
    
    this.log(`[Fatigue] Initialized: ${adjustedFatigue.toFixed(3)} (base: ${baseFatigue}, multiplier: ${this.storyMood.fatigueMultiplier.toFixed(2)})`);
    return clamp(adjustedFatigue, 0, 1.5);
  }
  
  log(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log(logEntry);
    this.logs.push(logEntry);
  }
  
  logSessionStart() {
    this.log(`[Session] Starting story session for ${this.accountId}`);
    this.log(`[Moods] Reels: ${this.reelsMood.name}, Story: ${this.storyMood.name}, Base: ${this.baseMood}`);
    this.log(`[State] SC: ${this.sc}, Fatigue: ${this.fatigue.toFixed(3)}, Handedness: ${this.handedness}`);
  }
  
  logSessionEnd() {
    const duration = Math.round((now() - this.startTime) / 1000);
    const endReasonText = this.endReason || 'unknown';
    this.log(`[Session] Ended: ${this.slidesWatched} slides, ${this.reactionsSent} reactions (${duration}s) - Reason: ${endReasonText}`);
    this.log(`[State] Final SC: ${this.sc.toFixed(2)}, Final Fatigue: ${this.fatigue.toFixed(3)}`);
  }
  
  setEndReason(reason) {
    this.endReason = reason;
  }
}

// ============================================================================
// ACCOUNT MODE SELECTION WITH DOUBLE MOODING (from spec §5)
// ============================================================================

function selectAccountMode(usc, fatigue, session) {
  // Base mode weights by USC (from spec)
  let weights = { 'Quick-skip': 0, 'Skim': 0, 'Normal': 0, 'Clear-all': 0 };
  
  if (usc <= 2) {
    weights = { 'Quick-skip': 0.1, 'Skim': 0, 'Normal': 0.2, 'Clear-all': 0.7 };
  } else if (usc <= 5) {
    weights = { 'Quick-skip': 0.05, 'Skim': 0.15, 'Normal': 0.6, 'Clear-all': 0.2 };
  } else if (usc <= 10) {
    weights = { 'Quick-skip': 0.1, 'Skim': 0.4, 'Normal': 0.4, 'Clear-all': 0.1 };
  } else {
    weights = { 'Quick-skip': 0.3, 'Skim': 0.5, 'Normal': 0.15, 'Clear-all': 0.05 };
  }
  
  // Adjust by fatigue (from spec §5.3)
  if (fatigue >= 1.1) {
    weights['Quick-skip'] += 0.2;
    weights['Normal'] -= 0.1;
    weights['Clear-all'] -= 0.1;
  } else if (fatigue >= 0.8) {
    weights['Quick-skip'] += 0.1;
    weights['Skim'] += 0.1;
    weights['Clear-all'] -= 0.2;
  } else if (fatigue <= 0.4) {
    weights['Clear-all'] += 0.1;
    weights['Skim'] -= 0.05;
    weights['Quick-skip'] -= 0.05;
  }
  
  // ============================================================================
  // DOUBLE MOODING: Combine Reels and Story moods for mode selection
  // ============================================================================
  
  // Reels mood influence on mode selection
  const reelsMoodAdjustments = getReelsMoodAdjustments(session.reelsMood);
  
  // Story mood influence on mode selection  
  const storyMoodAdjustments = getStoryMoodAdjustments(session.storyMood);
  
  // Combine both mood adjustments
  const combinedAdjustments = combineMoodAdjustments(reelsMoodAdjustments, storyMoodAdjustments);
  
  // Apply combined mood adjustments to weights
  Object.keys(weights).forEach(mode => {
    if (combinedAdjustments[mode]) {
      weights[mode] += combinedAdjustments[mode];
    }
  });
  
  // Normalize weights to ensure they sum to 1
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  Object.keys(weights).forEach(key => weights[key] /= total);
  
  // Sample mode
  const roll = Math.random();
  let cumulative = 0;
  for (const [mode, weight] of Object.entries(weights)) {
    cumulative += weight;
    if (roll <= cumulative) {
      session.log(`[Mode] Selected: ${mode} (USC: ${usc}, fatigue: ${fatigue.toFixed(3)}, weights: ${JSON.stringify(weights)})`);
      session.log(`[Moods] Reels: ${session.reelsMood.name} (${JSON.stringify(reelsMoodAdjustments)}), Story: ${session.storyMood.name} (${JSON.stringify(storyMoodAdjustments)})`);
      return mode;
    }
  }
  
  return 'Normal'; // Fallback
}

// ============================================================================
// REELS MOOD ADJUSTMENTS FOR ACCOUNT MODES
// ============================================================================

function getReelsMoodAdjustments(reelsMood) {
  const adjustments = { 'Quick-skip': 0, 'Skim': 0, 'Normal': 0, 'Clear-all': 0 };
  
  switch (reelsMood.name) {
    case 'WeekendFrenzy':
      // High energy, fast scrolling → bias toward Quick-skip and Skim
      adjustments['Quick-skip'] += 0.15;
      adjustments['Skim'] += 0.1;
      adjustments['Clear-all'] -= 0.15;
      adjustments['Normal'] -= 0.1;
      break;
      
    case 'MorningChill':
      // Relaxed, longer dwell → bias toward Normal and Clear-all
      adjustments['Normal'] += 0.1;
      adjustments['Clear-all'] += 0.15;
      adjustments['Quick-skip'] -= 0.1;
      adjustments['Skim'] -= 0.15;
      break;
      
    case 'MorningCoffeeScroll':
      // Fast scrolling, quick decisions → bias toward Quick-skip
      adjustments['Quick-skip'] += 0.2;
      adjustments['Skim'] += 0.05;
      adjustments['Clear-all'] -= 0.15;
      adjustments['Normal'] -= 0.1;
      break;
      
    case 'LunchtimeBrowse':
      // Engaged browsing, moderate pace → bias toward Normal
      adjustments['Normal'] += 0.15;
      adjustments['Skim'] += 0.05;
      adjustments['Quick-skip'] -= 0.1;
      adjustments['Clear-all'] -= 0.1;
      break;
      
    case 'AfternoonDistraction':
      // Slower, more lingering → bias toward Clear-all and Normal
      adjustments['Clear-all'] += 0.1;
      adjustments['Normal'] += 0.1;
      adjustments['Quick-skip'] -= 0.1;
      adjustments['Skim'] -= 0.1;
      break;
      
    case 'EveningRelaxMode':
      // Balanced, relaxed → slight bias toward Normal
      adjustments['Normal'] += 0.05;
      adjustments['Clear-all'] += 0.05;
      break;
      
    case 'NightOwlStalker':
      // High engagement, thorough viewing → bias toward Clear-all
      adjustments['Clear-all'] += 0.2;
      adjustments['Normal'] += 0.1;
      adjustments['Quick-skip'] -= 0.15;
      adjustments['Skim'] -= 0.15;
      break;
      
    default: // Default
      // No adjustments
      break;
  }
  
  return adjustments;
}

// ============================================================================
// STORY MOOD ADJUSTMENTS FOR ACCOUNT MODES
// ============================================================================

function getStoryMoodAdjustments(storyMood) {
  const adjustments = { 'Quick-skip': 0, 'Skim': 0, 'Normal': 0, 'Clear-all': 0 };
  
  switch (storyMood.name) {
    case 'MorningStoryCasual':
      // Casual morning viewing → bias toward Quick-skip and Skim
      adjustments['Quick-skip'] += 0.1;
      adjustments['Skim'] += 0.1;
      adjustments['Clear-all'] -= 0.1;
      adjustments['Normal'] -= 0.1;
      break;
      
    case 'MiddayStoryFocused':
      // Focused viewing → bias toward Normal
      adjustments['Normal'] += 0.15;
      adjustments['Clear-all'] += 0.05;
      adjustments['Quick-skip'] -= 0.1;
      adjustments['Skim'] -= 0.1;
      break;
      
    case 'AfternoonStoryEngaged':
      // High engagement → bias toward Clear-all and Normal
      adjustments['Clear-all'] += 0.15;
      adjustments['Normal'] += 0.1;
      adjustments['Quick-skip'] -= 0.1;
      adjustments['Skim'] -= 0.15;
      break;
      
    case 'EveningStoryBinge':
      // Binge watching → strong bias toward Clear-all
      adjustments['Clear-all'] += 0.25;
      adjustments['Normal'] += 0.1;
      adjustments['Quick-skip'] -= 0.2;
      adjustments['Skim'] -= 0.15;
      break;
      
    case 'NightStoryCasual':
      // Casual night viewing → bias toward Quick-skip and Skim
      adjustments['Quick-skip'] += 0.1;
      adjustments['Skim'] += 0.1;
      adjustments['Clear-all'] -= 0.1;
      adjustments['Normal'] -= 0.1;
      break;
      
    case 'LateNightStoryFocused':
      // Focused late night → bias toward Normal and Clear-all
      adjustments['Normal'] += 0.1;
      adjustments['Clear-all'] += 0.1;
      adjustments['Quick-skip'] -= 0.1;
      adjustments['Skim'] -= 0.1;
      break;
      
    default:
      // No adjustments
      break;
  }
  
  return adjustments;
}

// ============================================================================
// COMBINE MOOD ADJUSTMENTS WITH INTERACTION LOGIC
// ============================================================================

function combineMoodAdjustments(reelsAdjustments, storyAdjustments) {
  const combined = { 'Quick-skip': 0, 'Skim': 0, 'Normal': 0, 'Clear-all': 0 };
  
  // Combine adjustments with interaction logic
  Object.keys(combined).forEach(mode => {
    const reelsAdj = reelsAdjustments[mode] || 0;
    const storyAdj = storyAdjustments[mode] || 0;
    
    // Simple additive combination
    combined[mode] = reelsAdj + storyAdj;
  });
  
  // Apply interaction logic for specific mood combinations
  
  // High engagement combination: High reels engagement + High story engagement
  const highReelsEngagement = reelsAdjustments['Clear-all'] > 0.1 || reelsAdjustments['Normal'] > 0.1;
  const highStoryEngagement = storyAdjustments['Clear-all'] > 0.1 || storyAdjustments['Normal'] > 0.1;
  
  if (highReelsEngagement && highStoryEngagement) {
    // Both moods suggest high engagement → boost Clear-all
    combined['Clear-all'] += 0.1;
    combined['Quick-skip'] -= 0.05;
    combined['Skim'] -= 0.05;
  }
  
  // Low engagement combination: Low reels engagement + Low story engagement
  const lowReelsEngagement = reelsAdjustments['Quick-skip'] > 0.1 || reelsAdjustments['Skim'] > 0.1;
  const lowStoryEngagement = storyAdjustments['Quick-skip'] > 0.1 || storyAdjustments['Skim'] > 0.1;
  
  if (lowReelsEngagement && lowStoryEngagement) {
    // Both moods suggest low engagement → boost Quick-skip
    combined['Quick-skip'] += 0.1;
    combined['Clear-all'] -= 0.05;
    combined['Normal'] -= 0.05;
  }
  
  // Mixed engagement: One high, one low → bias toward Normal/Skim
  if ((highReelsEngagement && lowStoryEngagement) || (lowReelsEngagement && highStoryEngagement)) {
    combined['Normal'] += 0.1;
    combined['Skim'] += 0.05;
    combined['Clear-all'] -= 0.05;
    combined['Quick-skip'] -= 0.1;
  }
  
  return combined;
}

// ============================================================================
// SLIDE BEHAVIOR DECISIONS (from spec §6)
// ============================================================================

function determineSlideDwell(mode, hasText = false, wasReplayed = false) {
  let category, duration;
  
  // Choose dwell category (from spec §6.1)
  const roll = Math.random();
  
  if (mode === 'Quick-skip' || roll < 0.15) {
    category = 'quickScan';
    duration = rFloat(0.7, 2.0);
  } else if (roll < 0.85) {
    category = 'normalWatch';
    duration = rFloat(2.5, 7.0);
  } else {
    category = 'longWatch';
    duration = rFloat(7.0, 15.0);
  }
  
  // Bias toward long watch when text detected or replayed
  if (hasText || wasReplayed) {
    if (category === 'normalWatch') {
      category = 'longWatch';
      duration = rFloat(7.0, 15.0);
    }
  }
  
  return { category, duration };
}

// ============================================================================
// EMOJI REACTIONS WITH MOOD INFLUENCE
// ============================================================================

const EMOJI_REACTIONS = {
  laugh: { id: '😂', name: 'laugh' },
  heart: { id: '❤️', name: 'heart' },
  fire: { id: '🔥', name: 'fire' },
  wow: { id: '😮', name: 'wow' },
  clap: { id: '👏', name: 'clap' },
  thumbsUp: { id: '👍', name: 'thumbsUp' },
  eyes: { id: '👀', name: 'eyes' },
  rocket: { id: '🚀', name: 'rocket' },
};

function isReactionEligible(slideDwell, totalDwell, wasPaused, wasReplayed, session) {
  // Check caps: max 1 per account, max 1 per session
  if (session.reactionSentThisSession || session.reactionSentThisAccount) {
    return false;
  }
  
  // Check fatigue condition
  if (session.fatigue >= 1.10) {
    return false;
  }
  
  // Check eligibility conditions: dwell ≥6.5s OR paused ≥1.2s OR replayed
  const longEnoughDwell = totalDwell >= 6.5;
  const wasPausedLong = wasPaused && slideDwell >= 1.2;
  const wasReplayedCheck = wasReplayed;
  
  return longEnoughDwell || wasPausedLong || wasReplayed;
}

function selectEmojiReaction(session) {
  // Handle null/undefined session
  if (!session || !session.reelsMood || !session.storyMood) {
    console.warn('[selectEmojiReaction] Invalid session, using default values');
    session = {
      reelsMood: { likeMultiplier: 1.0 },
      storyMood: { emojiMultiplier: 1.0 }
    };
  }
  
  // Calculate mood-influenced 😂 chance (FIXED: balanced for human-like distribution)
  const baseLaughChance = 0.65; // Increased from 55% to 65% for better balance
  
  // Get mood multipliers for emoji reactions
  const reelsEmojiMultiplier = session.reelsMood.likeMultiplier || 1.0;
  const storyEmojiMultiplier = session.storyMood.emojiMultiplier || 1.0;
  
  // Combine mood influence (simple multiplication)
  const combinedMultiplier = reelsEmojiMultiplier * storyEmojiMultiplier;
  
  // Apply mood influence to 😂 chance (FIXED: cap at 70% maximum)
  let laughChance = baseLaughChance * combinedMultiplier;
  
  // Clamp between 35% and 75% (FIXED: better human-like range)
  laughChance = Math.max(0.35, Math.min(0.75, laughChance));
  
  // Generate random number
  const roll = Math.random();
  
  if (roll < laughChance) {
    return EMOJI_REACTIONS.laugh; // 😂 (mood-influenced chance)
  } else {
    // Remaining emojis split the remaining probability (per client requirement)
    const remainingChance = 1 - laughChance;
    
    // Define distribution for remaining emojis (11%, 3%, 4%, then distribute 2% among others)
    const remainingEmojis = [
      { emoji: EMOJI_REACTIONS.heart, chance: 0.11 },   // 11%
      { emoji: EMOJI_REACTIONS.fire, chance: 0.04 },    // 4%
      { emoji: EMOJI_REACTIONS.wow, chance: 0.03 },     // 3%
      { emoji: EMOJI_REACTIONS.clap, chance: 0.005 },   // 0.5%
      { emoji: EMOJI_REACTIONS.thumbsUp, chance: 0.005 }, // 0.5%
      { emoji: EMOJI_REACTIONS.eyes, chance: 0.003 },   // 0.3%
      { emoji: EMOJI_REACTIONS.rocket, chance: 0.002 }, // 0.2%
    ];
    
    // Normalize remaining chances to fit the remaining probability
    const totalRemainingChance = remainingEmojis.reduce((sum, item) => sum + item.chance, 0);
    const normalizedRoll = (roll - laughChance) / remainingChance;
    
    let cumulativeChance = 0;
    for (const item of remainingEmojis) {
      const normalizedChance = (item.chance / totalRemainingChance);
      cumulativeChance += normalizedChance;
      if (normalizedRoll <= cumulativeChance) {
        return item.emoji;
      }
    }
    
    // Fallback to heart if something goes wrong
    return EMOJI_REACTIONS.heart;
  }
}

function getEmojiDistributionInfo(session) {
  // Calculate mood-influenced distribution for logging (FIXED: match selectEmojiReaction)
  const baseLaughChance = 0.65; // Increased from 55% to 65% base
  const reelsEmojiMultiplier = session.reelsMood.likeMultiplier || 1.0;
  const storyEmojiMultiplier = session.storyMood.emojiMultiplier || 1.0;
  const combinedMultiplier = reelsEmojiMultiplier * storyEmojiMultiplier;
  const laughChance = Math.max(0.35, Math.min(0.75, baseLaughChance * combinedMultiplier));
  
  return {
    laughChance: (laughChance * 100).toFixed(1),
    reelsMultiplier: reelsEmojiMultiplier.toFixed(2),
    storyMultiplier: storyEmojiMultiplier.toFixed(2),
    combinedMultiplier: combinedMultiplier.toFixed(2)
  };
}

// ============================================================================
// TOUCH INTERACTIONS
// ============================================================================

async function enableTouchEmulation(page) {
  const cdp = await page.target().createCDPSession();
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
}

async function touchTapAt(page, x, y, opts = {}) {
  const { force = 0.55, radius = 4, delayMs = 90 } = opts;
  try {
    const vpDims = await page.evaluate(() => ({ w: innerWidth || 360, h: innerHeight || 640 }));
    const cx = Math.max(1, Math.min(vpDims.w - 2, Math.round(x)));
    const cy = Math.max(1, Math.min(vpDims.h - 2, Math.round(y)));
    
    const cdp = await page.target().createCDPSession();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: cx, y: cy, id: 1, force, radiusX: radius, radiusY: radius }],
    });
    await sleep(delayMs);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    try { await cdp.detach(); } catch { }
    return true;
  } catch { return false; }
}

async function storyTapNext(page, session) {
  const vpDims = await page.evaluate(() => ({ w: innerWidth || 360, h: innerHeight || 640 }));
  
  // Tap the right side of the screen (x near the right edge, y in the vertical center)
  // This simulates tapping to advance to the next story slide
  const tapX = rInt(vpDims.w * 0.75, vpDims.w * 0.95); // Right 25-5% of screen width
  const tapY = rInt(vpDims.h * 0.35, vpDims.h * 0.65); // Vertical center ±15%
  
  // Add small random offset for human-like variation
  const offsetX = rInt(-10, 10);
  const offsetY = rInt(-15, 15);
  const finalX = Math.max(1, Math.min(vpDims.w - 2, tapX + offsetX));
  const finalY = Math.max(1, Math.min(vpDims.h - 2, tapY + offsetY));
  
  session.log(`[Continue] 👉 Tapped right side for next slide (${finalX}, ${finalY})`);
  
  try {
    const cdp = await page.target().createCDPSession();
    
    // Touch start with realistic pressure and radius
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ 
        x: finalX, 
        y: finalY, 
        id: 1, 
        force: rFloat(0.4, 0.7), 
        radiusX: rInt(3, 6), 
        radiusY: rInt(3, 6) 
      }],
    });
    
    // Hold for realistic duration
    await sleep(rInt(80, 150));
    
    // Touch end
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    
    return true;
  } catch (error) {
    session.log(`[Continue] ❌ Tap failed: ${error.message}`);
    return false;
  }
}

async function sendEmojiReaction(page, emoji, session) {
  try {
    session.log(`[Reaction] Attempting to send: ${emoji.id} (${emoji.name})`);
    
    // Find and click the reaction button
    const reactionSelectors = [
      'div[role="button"] svg[aria-label="Like"]',
      'div[role="button"] svg[aria-label="Heart"]',
      'div[role="button"] svg[aria-label="Love"]',
      'button svg[aria-label="Like"]',
      'button svg[aria-label="Heart"]',
      'div[data-testid="story-reaction-button"]',
    ];
    
    let reactionButton = null;
    for (const selector of reactionSelectors) {
      try {
        reactionButton = await page.$(selector);
        if (reactionButton) break;
      } catch (error) {
        // Continue to next selector
      }
    }
    
    if (!reactionButton) {
      session.log(`[Reaction] No reaction button found`);
      return false;
    }
    
    const box = await reactionButton.boundingBox();
    if (!box) {
      session.log(`[Reaction] Reaction button has no bounding box`);
      return false;
    }
    
    const x = box.x + box.width * 0.5 + rFloat(-3, 3);
    const y = box.y + box.height * 0.5 + rFloat(-3, 3);
    
    await touchTapAt(page, x, y, { delayMs: rInt(80, 120) });
    await sleep(rInt(300, 600));
    
    // Find and click the specific emoji
    const emojiSelectors = [
      `div[role="button"] span[aria-label="${emoji.id}"]`,
      `div[role="button"] span:contains("${emoji.id}")`,
      `div[role="button"] div:contains("${emoji.id}")`,
      `button span[aria-label="${emoji.id}"]`,
      `div[data-testid="story-reaction-${emoji.name}"]`,
    ];
    
    let emojiButton = null;
    for (const selector of emojiSelectors) {
      try {
        emojiButton = await page.$(selector);
        if (emojiButton) break;
      } catch (error) {
        // Continue to next selector
      }
    }
    
    if (emojiButton) {
      const emojiBox = await emojiButton.boundingBox();
      if (emojiBox) {
        const emojiX = emojiBox.x + emojiBox.width * 0.5 + rFloat(-2, 2);
        const emojiY = emojiBox.y + emojiBox.height * 0.5 + rFloat(-2, 2);
        await touchTapAt(page, emojiX, emojiY, { delayMs: rInt(60, 100) });
        session.log(`[Reaction] ✅ Successfully sent: ${emoji.id}`);
        return true;
      }
    }
    
    // Fallback: try to find emoji by text content
    const emojiFound = await page.evaluate((emojiId) => {
      const elements = Array.from(document.querySelectorAll('div[role="button"], button'));
      for (const element of elements) {
        if (element.textContent && element.textContent.includes(emojiId)) {
          element.click();
          return true;
        }
      }
      return false;
    }, emoji.id);
    
    if (emojiFound) {
      session.log(`[Reaction] ✅ Successfully sent via fallback: ${emoji.id}`);
      return true;
    }
    
    session.log(`[Reaction] ❌ Failed to send: ${emoji.id}`);
    return false;
  } catch (error) {
    session.log(`[Reaction] Error: ${error.message}`);
    return false;
  }
}

// ============================================================================
// STORY NAVIGATION AND DETECTION
// ============================================================================

async function handlePrivacyConfirmation(page) {
  try {
    // Check if we're on a privacy confirmation screen
    const hasPrivacyPrompt = await page.evaluate(() => {
      // Check for privacy confirmation text
      const hasPrivacyText = document.body.textContent.includes('View as') || 
                            document.body.textContent.includes('will be able to see');
      
      // Check for view story button by text content
      const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
      const hasViewStoryButton = buttons.some(button => 
        button.textContent && button.textContent.includes('View story')
      );
      
      return hasPrivacyText || hasViewStoryButton;
    });
    
    if (hasPrivacyPrompt) {
      console.log(`[Stories] Privacy confirmation detected, attempting to proceed...`);
      
      // Try to find and click the "View story" button by text content
      const buttonFound = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
        for (const button of buttons) {
          if (button.textContent && button.textContent.includes('View story')) {
            button.click();
            return true;
          }
        }
        return false;
      });
      
      if (buttonFound) {
        console.log(`[Stories] Clicked "View story" button via text search`);
        await sleep(rInt(1000, 2000));
        return true;
      }
      
      // Fallback: try specific selectors
      const viewStorySelectors = [
        'button[data-testid="view-story-button"]',
        'div[data-testid="story-privacy-confirmation"] button',
        'button[aria-label*="View story"]',
        'div[role="button"][aria-label*="View story"]',
      ];
      
      for (const selector of viewStorySelectors) {
        try {
          const viewButton = await page.$(selector);
          if (viewButton) {
            await touchTapHandle(page, viewButton);
            console.log(`[Stories] Clicked "View story" button with selector: ${selector}`);
            await sleep(rInt(1000, 2000));
            return true;
          }
        } catch (error) {
          // Continue to next selector
        }
      }
      
      console.log(`[Stories] Could not find "View story" button`);
      return false;
    }
    
    return true; // No privacy prompt found
  } catch (error) {
    console.log(`[Stories] Error handling privacy confirmation: ${error.message}`);
    return false;
  }
}

async function navigateToStories(page) {
  try {
    console.log(`[Stories] Attempting to navigate to stories...`);
    
    const storiesSelectors = [
      'div[role="button"]:has(circle[stroke*="url"])',
      'div[role="button"]:has(circle[stroke*="gradient"])',
      'div[role="button"]:has(circle[stroke*="#"])',
      'div[role="button"]:has(circle[stroke-width])',
      'div[role="button"]:has(img[alt*="profile" i])',
      'div[role="button"]:has(img[alt*="story" i])',
      'div[data-testid="story-ring"]',
      'div[aria-label*="story" i]',
      'div[role="button"]:has(div[data-testid="story-ring"])',
      'div[role="button"]:has(circle)',
      'div[role="button"]:has(svg[aria-label*="story" i])',
    ];
    
    for (let i = 0; i < storiesSelectors.length; i++) {
      const selector = storiesSelectors[i];
      try {
        const storyElements = await page.$$(selector);
        console.log(`[Stories] Found ${storyElements.length} elements with selector: ${selector}`);
        
        if (storyElements.length > 0) {
          // Try to find a story that hasn't been watched yet
          let storyButton = null;
          
          // First, try to find stories with unread indicators
          for (let j = 0; j < storyElements.length; j++) {
            const element = storyElements[j];
            const hasUnreadIndicator = await element.evaluate(el => {
              // Check for unread indicators like colored borders, dots, etc.
              const hasColoredBorder = el.querySelector('circle[stroke*="url"], circle[stroke*="gradient"], circle[stroke*="#"]');
              const hasUnreadDot = el.querySelector('div[data-testid="story-ring"]');
              const hasUnreadClass = el.className.includes('unread') || el.className.includes('new');
              return hasColoredBorder || hasUnreadDot || hasUnreadClass;
            });
            
            if (hasUnreadIndicator) {
              storyButton = element;
              console.log(`[Stories] Found unread story at index ${j}`);
              break;
            }
          }
          
          // If no unread stories found, try any story that's not "Your story"
          if (!storyButton) {
            for (let j = 0; j < storyElements.length; j++) {
              const element = storyElements[j];
              const isNotYourStory = await element.evaluate(el => {
                const isYourStory = el.querySelector('img[alt*="profile" i]') && 
                                  (el.textContent.includes('Your story') || 
                                   el.getAttribute('aria-label')?.includes('Your story') ||
                                   el.querySelector('div[data-testid="add-to-story"]'));
                return !isYourStory;
              });
              
              if (isNotYourStory) {
                storyButton = element;
                console.log(`[Stories] Using non-Your-story at index ${j}`);
                break;
              }
            }
          }
          
          // Last resort: use the first one if no better option found
          if (!storyButton && storyElements.length > 0) {
            storyButton = storyElements[0];
            console.log(`[Stories] Using first available story (last resort)`);
          }
          
          if (storyButton) {
            await touchTapHandle(page, storyButton);
            await sleep(rInt(1000, 2000));
            console.log(`[Stories] Clicked story element with selector: ${selector}`);
            
            // Wait a bit and check if we successfully entered story view
            await sleep(2000);
            const isInStoryView = await isStoryActive(page);
            
            if (isInStoryView) {
              console.log(`[Stories] Successfully entered story view`);
              return true;
            } else {
              console.log(`[Stories] Failed to enter story view, trying next selector`);
              continue; // Try next selector instead of returning false
            }
          }
        }
      } catch (error) {
        console.log(`[Stories] Selector failed: ${selector} - ${error.message}`);
      }
    }
    
    console.log(`[Stories] No story elements found`);
    return false;
  } catch (error) {
    console.log(`[Stories] Navigation error: ${error.message}`);
    return false;
  }
}

async function isStoryActive(page) {
  try {
    return await page.evaluate(() => {
      const storyIndicators = [
        'div[role="dialog"] div[data-testid="story-viewer"]',
        'div[role="dialog"] div[aria-label*="story" i]',
        'div[role="dialog"] div[data-testid="story-container"]',
        'div[role="dialog"] div[data-testid="story-player"]',
        'div[role="dialog"] div[data-testid="story-progress"]',
        'div[role="dialog"] div[data-testid="story-controls"]',
        'div[role="dialog"] button[aria-label*="story" i]',
        'div[role="dialog"] video[src]',
        'div[role="dialog"] img[alt*="story" i]',
        'div[role="dialog"] div[data-testid="story-navigation"]',
        'div[role="dialog"] div[data-testid="story-close"]',
        'div[role="dialog"] div[style*="story"]',
        'div[role="dialog"] div[class*="story"]',
      ];
      
      const hasStoryIndicator = storyIndicators.some(selector => document.querySelector(selector));
      
      const url = window.location.href;
      const hasStoryUrl = url.includes('/stories/') || url.includes('story') || url.includes('reel');
      
      const dialog = document.querySelector('div[role="dialog"]');
      const hasStoryDialog = dialog && (
        dialog.querySelector('video') || 
        dialog.querySelector('img[alt*="profile"]') ||
        dialog.querySelector('button[aria-label*="close"]')
      );
      
      return hasStoryIndicator || hasStoryUrl || hasStoryDialog;
    });
  } catch (error) {
    console.log(`[Stories] Story detection error: ${error.message}`);
    return false;
  }
}

async function getStoryProgress(page) {
  try {
    return await page.evaluate(() => {
      const progressBars = document.querySelectorAll('div[role="progressbar"], div[data-testid="story-progress"]');
      if (progressBars.length > 0) {
        return progressBars.length;
      }
      return 1;
    });
  } catch {
    return 1;
  }
}

async function touchTapHandle(page, handle) {
  try {
    const box = await handle.boundingBox();
    if (!box) return false;
    const x = box.x + box.width * 0.5;
    const y = box.y + box.height * 0.5;
    return await touchTapAt(page, x, y);
  } catch { return false; }
}

// ============================================================================
// MAIN STORY WATCHING FUNCTION WITH SC SYSTEM
// ============================================================================

async function watchStories(page, durationSeconds = 60, accountId = 'unknown') {
  // Initialize session with SC system
  const session = new StorySession(accountId, durationSeconds);
  
  const startTime = now();
  const endTime = startTime + (durationSeconds * 1000);
  
  // Enable touch emulation
  await enableTouchEmulation(page);
  
  // Navigate to stories
  const navigationSuccess = await navigateToStories(page);
  if (!navigationSuccess) {
    session.log(`[Stories] Failed to navigate to stories`);
    session.logSessionEnd();
    return { ok: true, storiesWatched: 0, reactionsSent: 0, durationSec: 0, accountId, note: 'no_stories_available' };
  }
  
  let sessionActive = true;
  let currentAccount = null;
  let currentAccountSlidesWatched = 0;
  let currentAccountMode = null;
  let currentAccountUSC = 0;
  let currentAccountSlidesPlanned = 0;
  let currentAccountSlideIndices = []; // Track which specific slides to watch
  let currentSlideIndex = 0; // Track current position in story
  let consecutiveFailedTaps = 0; // Track failed tap attempts
  let consecutiveNavigationFailures = 0; // Track navigation failures to prevent infinite loops
  
  while (sessionActive && now() < endTime) {
    try {
      // Check end conditions (from spec §9.2)
      if (session.sc < 1.0) {
        session.setEndReason(`SC exhausted (${session.sc.toFixed(2)})`);
        session.log(`[Session] Ending: SC exhausted (${session.sc.toFixed(2)})`);
        break;
      }
      
      if (session.fatigue >= 1.2) {
        const endChance = 0.7;
        if (Math.random() < endChance) {
          session.setEndReason(`High fatigue (${session.fatigue.toFixed(3)})`);
          session.log(`[Session] Ending: High fatigue (${session.fatigue.toFixed(3)})`);
          break;
        }
      }
      
      // Check if we're in a story
      const storyActive = await isStoryActive(page);
      if (!storyActive) {
        session.log(`[Stories] Not in story view, attempting to navigate...`);
        
        // Prevent infinite loops by limiting navigation retries
        consecutiveNavigationFailures++;
        if (consecutiveNavigationFailures > 5) {
          session.setEndReason('Too many navigation failures');
          session.log(`[Stories] Too many navigation failures (${consecutiveNavigationFailures}), ending session`);
          break;
        }
        
        const navSuccess = await navigateToStories(page);
        if (!navSuccess) {
          session.log(`[Stories] Navigation failed (attempt ${consecutiveNavigationFailures}/5)`);
          await sleep(rInt(2000, 4000)); // Wait longer before retry
          continue;
        } else {
          // Reset failure counter on successful navigation
          consecutiveNavigationFailures = 0;
        }
        
        await sleep(rInt(500, 1000));
        continue;
      }
      
      // Reset navigation failure counter when we're successfully in story view
      consecutiveNavigationFailures = 0;
      
      // Get current story info
      const currentStoryInfo = await page.evaluate(() => {
        const url = window.location.href;
        const storyUser = url.match(/\/stories\/([^\/]+)\//)?.[1] || 'unknown';
        const storyTime = document.querySelector('time')?.textContent || '';
        const storyId = document.querySelector('[data-testid="story-item"]')?.getAttribute('data-testid') || 
                       document.querySelector('[data-testid="story-player"]')?.getAttribute('data-testid') || 
                       'unknown';
        return { user: storyUser, time: storyTime, url, storyId };
      });
      
      // Check if this is a new account
      const isNewAccount = currentAccount !== currentStoryInfo.user;
      
      if (isNewAccount) {
        // Log completion of previous account
        if (currentAccount) {
          session.log(`[Account] Completed: ${currentAccount} (${currentAccountSlidesWatched}/${currentAccountSlidesPlanned} slides watched)`);
        }
        
        // Initialize new account
        currentAccount = currentStoryInfo.user;
        currentAccountSlidesWatched = 0;
        currentSlideIndex = 0;
        consecutiveFailedTaps = 0;
        session.reactionSentThisAccount = false;
        
        // Get USC (Unseen Slide Count) for this account
        currentAccountUSC = await getStoryProgress(page);
        
        // Select account mode based on USC and fatigue
        currentAccountMode = selectAccountMode(currentAccountUSC, session.fatigue, session);
        
        // Determine how many slides to watch based on mode and SC/fatigue constraints
        currentAccountSlidesPlanned = determineSlidesToWatchWithConstraints(currentAccountMode, currentAccountUSC, session);
        
        // Determine which specific slides to watch based on mode
        currentAccountSlideIndices = determineSlideIndicesToWatch(currentAccountMode, currentAccountUSC, currentAccountSlidesPlanned);
        
        session.log(`[Account] New account: ${currentAccount} (USC: ${currentAccountUSC}, Mode: ${currentAccountMode}, Planned: ${currentAccountSlidesPlanned} slides)`);
        session.log(`[Account] Slide indices to watch: [${currentAccountSlideIndices.join(', ')}]`);
        
        // Check for very long account deferral (from spec §5.6)
        if (currentAccountUSC >= 10 && (session.fatigue > 0.9 || session.sc < 6)) {
          const deferChance = rFloat(0.3, 0.5);
          if (Math.random() < deferChance) {
            session.log(`[Account] Deferring long account ${currentAccount} (fatigue: ${session.fatigue.toFixed(3)}, SC: ${session.sc.toFixed(2)})`);
            // Skip this account and try to find next
            const skipSuccess = await skipToNextAccount(page, session);
            if (!skipSuccess) {
              session.setEndReason('No more accounts available after deferral');
              session.log(`[Stories] No more accounts available after deferral`);
              break;
            }
            continue;
          }
        }
      }
      
      // Check if current slide should be watched based on mode
      const shouldWatchCurrentSlide = currentAccountSlideIndices.includes(currentSlideIndex);
      
      if (shouldWatchCurrentSlide) {
        // Log current slide being watched
        session.log(`[Slide] Watching slide ${currentSlideIndex + 1}/${currentAccountUSC} (planned ${currentAccountSlidesWatched + 1}/${currentAccountSlidesPlanned}) for ${currentAccount} (${currentStoryInfo.time})`);
        
        // Determine slide behavior based on mode
        const slideBehavior = determineSlideDwell(currentAccountMode);
        const { category, duration } = slideBehavior;
        
        session.log(`[Slide] Dwell: ${category} (${duration.toFixed(1)}s), Mode: ${currentAccountMode}`);
        
        // Watch the slide
        await sleep(duration * 1000);
        currentAccountSlidesWatched++;
        session.slidesWatched++;
        
        // Update SC and fatigue
        const scCost = rFloat(SC_COSTS[category].min, SC_COSTS[category].max);
        session.sc -= scCost;
        
        const fatigueIncrement = rFloat(FATIGUE_INCREMENTS[category].min, FATIGUE_INCREMENTS[category].max);
        const moodFatigueMultiplier = FATIGUE_MULTIPLIERS[session.baseMood];
        session.fatigue += fatigueIncrement * moodFatigueMultiplier;
        session.fatigue = clamp(session.fatigue, 0, 1.5);
        
        session.log(`[Slide] SC: -${scCost.toFixed(2)} (remaining: ${session.sc.toFixed(2)}), Fatigue: +${(fatigueIncrement * moodFatigueMultiplier).toFixed(3)} (total: ${session.fatigue.toFixed(3)})`);
        
        // Check for emoji reaction
        if (isReactionEligible(duration, duration, false, false, session)) {
          const reactionChance = 0.06; // 6% from spec
          if (Math.random() < reactionChance) {
            const selectedEmoji = selectEmojiReaction(session);
            const emojiInfo = getEmojiDistributionInfo(session);
            
            session.log(`[Reaction] 🎯 Attempting: ${selectedEmoji.id} (${selectedEmoji.name})`);
            session.log(`[Reaction] Mood influence: 😂 ${emojiInfo.laughChance}% (reels: ${emojiInfo.reelsMultiplier}x, story: ${emojiInfo.storyMultiplier}x, combined: ${emojiInfo.combinedMultiplier}x)`);
            
            const reactionSuccess = await sendEmojiReaction(page, selectedEmoji, session);
            if (reactionSuccess) {
              session.reactionsSent++;
              session.reactionSentThisSession = true;
              session.reactionSentThisAccount = true;
              session.log(`[Reaction] ✅ Sent: ${selectedEmoji.id} (${session.reactionsSent} total this session)`);
              
              // Brief linger after reaction
              await sleep(rFloat(0.8, 2.2) * 1000);
            } else {
              session.log(`[Reaction] ❌ Failed to send: ${selectedEmoji.id}`);
            }
          } else {
            // Log when reaction was eligible but not triggered (for debugging)
            const emojiInfo = getEmojiDistributionInfo(session);
            session.log(`[Reaction] Eligible but not triggered (6% chance missed, 😂 would be ${emojiInfo.laughChance}%)`);
          }
        } else {
          // Log why reaction was not eligible (for debugging)
          const reasons = [];
          if (session.reactionSentThisSession) reasons.push('session cap');
          if (session.reactionSentThisAccount) reasons.push('account cap');
          if (session.fatigue >= 1.10) reasons.push('high fatigue');
          if (duration < 6.5) reasons.push('short dwell');
          
          session.log(`[Reaction] Not eligible: ${reasons.join(', ')}`);
        }
      } else {
        // Skip this slide (not in planned indices)
        session.log(`[Slide] Skipping slide ${currentSlideIndex + 1}/${currentAccountUSC} for ${currentAccount} (not in planned indices: [${currentAccountSlideIndices.join(', ')}])`);
      }
      
      // Check if we've completed the planned slides for this account
      if (currentAccountSlidesWatched >= currentAccountSlidesPlanned) {
        session.log(`[Account] Completed planned slides for ${currentAccount} (${currentAccountSlidesWatched}/${currentAccountSlidesPlanned})`);
        
        // Apply fatigue recovery between accounts (from spec §3.2)
        const recovery = rFloat(0.01, 0.04);
        session.fatigue = Math.max(0, session.fatigue - recovery);
        session.log(`[Fatigue] Recovery: -${recovery.toFixed(3)} (new: ${session.fatigue.toFixed(3)})`);
        
        // Move to next account
        const nextAccountSuccess = await moveToNextAccount(page, session);
        if (!nextAccountSuccess) {
          session.setEndReason('No more accounts available');
          session.log(`[Stories] No more accounts available, ending session`);
          break;
        }
        
        // Reset account tracking for new account
        currentAccount = null;
        currentAccountSlidesWatched = 0;
        currentAccountMode = null;
        currentAccountUSC = 0;
        currentAccountSlidesPlanned = 0;
        currentAccountSlideIndices = [];
        currentSlideIndex = 0;
        consecutiveFailedTaps = 0;
        session.reactionSentThisAccount = false;
        
        // Small delay between accounts
        await sleep(rInt(600, 4200));
        
        // Add mood-based additional delay
        const moodDelay = Math.round(session.storyMood.storySpeedMultiplier * 1000);
        if (moodDelay > 0) {
          session.log(`[Session] Mood delay: ${moodDelay}ms (${session.storyMood.name})`);
          await sleep(moodDelay);
        }
        
        // Occasionally insert long gap (10% chance, 10-20s)
        if (Math.random() < 0.1) {
          const longGap = rInt(10000, 20000);
          session.log(`[Session] Long gap: ${longGap}ms (simulating distraction)`);
          await sleep(longGap);
        }
        
        continue;
      }
      
      // Early exit logic for Quick-skip mode (from spec §5.4)
      if (currentAccountMode === 'Quick-skip' && currentAccountSlidesWatched >= 1) {
        session.log(`[Account] Quick-skip mode: completed 1 slide, exiting account ${currentAccount}`);
        
        // Apply fatigue recovery and move to next account
        const recovery = rFloat(0.01, 0.04);
        session.fatigue = Math.max(0, session.fatigue - recovery);
        session.log(`[Fatigue] Recovery: -${recovery.toFixed(3)} (new: ${session.fatigue.toFixed(3)})`);
        
        const nextAccountSuccess = await moveToNextAccount(page, session);
        if (!nextAccountSuccess) {
          session.setEndReason('No more accounts available');
          session.log(`[Stories] No more accounts available, ending session`);
          break;
        }
        
        // Reset account tracking for new account
        currentAccount = null;
        currentAccountSlidesWatched = 0;
        currentAccountMode = null;
        currentAccountUSC = 0;
        currentAccountSlidesPlanned = 0;
        currentAccountSlideIndices = [];
        currentSlideIndex = 0;
        consecutiveFailedTaps = 0;
        session.reactionSentThisAccount = false;
        
        // Small delay between accounts
        await sleep(rInt(600, 4200));
        continue;
      }
      
      // Check for early exit chance in Skim/Normal modes (from spec §5.5)
      if ((currentAccountMode === 'Skim' || currentAccountMode === 'Normal') && 
          currentAccountSlidesWatched >= 1 && currentAccountSlidesWatched <= 2) {
        
        // Base chance small, increases with fatigue
        const baseChance = 0.05;
        const fatigueBonus = Math.max(0, session.fatigue - 0.6) * 0.2;
        const earlyExitChance = baseChance + fatigueBonus;
        
        if (Math.random() < earlyExitChance) {
          session.log(`[Account] Early exit triggered (chance: ${(earlyExitChance * 100).toFixed(1)}%) for ${currentAccount}`);
          
          // Apply fatigue recovery and move to next account
          const recovery = rFloat(0.01, 0.04);
          session.fatigue = Math.max(0, session.fatigue - recovery);
          session.log(`[Fatigue] Recovery: -${recovery.toFixed(3)} (new: ${session.fatigue.toFixed(3)})`);
          
          const nextAccountSuccess = await moveToNextAccount(page, session);
          if (!nextAccountSuccess) {
            session.setEndReason('No more accounts available');
            session.log(`[Stories] No more accounts available, ending session`);
            break;
          }
          
          // Reset account tracking for new account
          currentAccount = null;
          currentAccountSlidesWatched = 0;
          currentAccountMode = null;
          currentAccountUSC = 0;
          currentAccountSlidesPlanned = 0;
          currentAccountSlideIndices = [];
          currentSlideIndex = 0;
          consecutiveFailedTaps = 0;
          session.reactionSentThisAccount = false;
          
          // Small delay between accounts
          await sleep(rInt(600, 4200));
          
          // Add mood-based additional delay
          const moodDelay = Math.round(session.storyMood.storySpeedMultiplier * 1000);
          if (moodDelay > 0) {
            session.log(`[Session] Mood delay: ${moodDelay}ms (${session.storyMood.name})`);
            await sleep(moodDelay);
          }
          
          continue;
        }
      }
      
      // Move to next slide within the same account
      session.log(`[Slide] Moving to next slide within ${currentAccount}...`);
      const nextSlideSuccess = await moveToNextSlide(page, session);
      
      if (!nextSlideSuccess) {
        consecutiveFailedTaps++;
        session.log(`[Navigation] Failed to move to next slide (consecutive failures: ${consecutiveFailedTaps})`);
        
        // If we've failed too many times, exit this account
        if (consecutiveFailedTaps >= 3) {
          session.log(`[Account] Too many failed taps (${consecutiveFailedTaps}), completing account ${currentAccount} early`);
        
        // Apply fatigue recovery and move to next account
        const recovery = rFloat(0.01, 0.04);
        session.fatigue = Math.max(0, session.fatigue - recovery);
        session.log(`[Fatigue] Recovery: -${recovery.toFixed(3)} (new: ${session.fatigue.toFixed(3)})`);
        
        const nextAccountSuccess = await moveToNextAccount(page, session);
        if (!nextAccountSuccess) {
          session.setEndReason('No more accounts available');
          session.log(`[Stories] No more accounts available, ending session`);
          break;
        }
          
          // Reset account tracking for new account
          currentAccount = null;
          currentAccountSlidesWatched = 0;
          currentAccountMode = null;
          currentAccountUSC = 0;
          currentAccountSlidesPlanned = 0;
          currentAccountSlideIndices = [];
          currentSlideIndex = 0;
          consecutiveFailedTaps = 0;
          session.reactionSentThisAccount = false;
          
          continue;
      } else {
          // Try again with a longer delay
          await sleep(rInt(1000, 2000));
        }
      } else {
        // Successfully moved to next slide, increment slide index and reset failure counter
        currentSlideIndex++;
        consecutiveFailedTaps = 0;
      }
      
      // Small delay between slides
      await sleep(rInt(200, 800));
      
    } catch (error) {
      session.log(`[Stories] Error in story loop: ${error.message}`);
      await sleep(1000);
    }
  }
  
  // Log completion of final account
  if (currentAccount) {
    session.log(`[Account] Completed: ${currentAccount} (${currentAccountSlidesWatched}/${currentAccountSlidesPlanned} slides watched)`);
  }
  
  // Set default end reason if none was set
  if (!session.endReason) {
    session.setEndReason('Session completed normally');
  }
  
  session.logSessionEnd();
  
  const actualDuration = Math.round((now() - startTime) / 1000);
  return {
    ok: true,
    storiesWatched: session.slidesWatched,
    reactionsSent: session.reactionsSent,
    durationSec: actualDuration,
    accountId,
    finalSC: session.sc,
    finalFatigue: session.fatigue
  };
}

// ============================================================================
// HELPER FUNCTIONS FOR ACCOUNT MODE IMPLEMENTATION
// ============================================================================

function determineSlidesToWatchWithConstraints(mode, usc, session) {
  // Get base slide count from mode
  let baseCount = determineSlidesToWatch(mode, usc, session);
  
  // Apply SC constraints
  const scAvailable = session.sc;
  const avgScPerSlide = 1.5; // Average SC cost per slide
  const maxSlidesBySC = Math.floor(scAvailable / avgScPerSlide);
  
  // Apply fatigue constraints
  let maxSlidesByFatigue = usc;
  if (session.fatigue >= 1.0) {
    maxSlidesByFatigue = Math.max(1, Math.floor(usc * 0.3)); // 30% of USC when very fatigued
  } else if (session.fatigue >= 0.8) {
    maxSlidesByFatigue = Math.max(1, Math.floor(usc * 0.6)); // 60% of USC when moderately fatigued
  }
  
  // Take the minimum of all constraints
  const constrainedCount = Math.min(baseCount, maxSlidesBySC, maxSlidesByFatigue, usc);
  
  session.log(`[Planning] Base: ${baseCount}, SC limit: ${maxSlidesBySC}, Fatigue limit: ${maxSlidesByFatigue}, Final: ${constrainedCount}`);
  
  return Math.max(1, constrainedCount); // Always watch at least 1 slide
}

function determineSlidesToWatch(mode, usc, session) {
  switch (mode) {
    case 'Quick-skip':
      return 1; // Watch ≤1 slide briefly (always first)
      
    case 'Skim':
      // Watch 2-3 slides (first, middle, maybe last)
      if (usc <= 2) return usc;
      if (usc <= 3) return 2;
      return 3;
      
    case 'Normal':
      // Watch 60-80% of slides, but cap at 7
      const percentage = rFloat(0.6, 0.8);
      const planned = Math.round(usc * percentage);
      return Math.min(planned, 7);
      
    case 'Clear-all':
      return usc; // Watch every slide
      
    default:
      return Math.min(usc, 3);
  }
}

// ============================================================================
// SLIDE SELECTION LOGIC FOR ACCOUNT MODES
// ============================================================================

function determineSlideIndicesToWatch(mode, usc, plannedCount) {
  const indices = [];
  
  switch (mode) {
    case 'Quick-skip':
      // Always watch first slide
      indices.push(0);
      break;
      
    case 'Skim':
      // Always include first slide
      indices.push(0);
      
      if (plannedCount >= 2) {
        // Add middle slide(s)
        if (usc <= 3) {
          // For small accounts, just add the last slide
          indices.push(usc - 1);
        } else {
          // For larger accounts, add middle slide
          const middleIndex = Math.floor(usc / 2);
          if (!indices.includes(middleIndex)) {
            indices.push(middleIndex);
          }
          
          // Maybe include last slide (40% chance)
          if (plannedCount >= 3 && Math.random() < 0.4) {
            const lastIndex = usc - 1;
            if (!indices.includes(lastIndex)) {
              indices.push(lastIndex);
            }
          }
        }
      }
      break;
      
    case 'Normal':
      // Watch a contiguous block starting near the beginning
      const startIndex = Math.floor(usc * 0.1); // Start around 10% into the story
      const endIndex = Math.min(startIndex + plannedCount - 1, usc - 1);
      
      for (let i = startIndex; i <= endIndex; i++) {
        indices.push(i);
      }
      
      // Occasionally skip 1 inside the block (looks human)
      if (indices.length > 2 && Math.random() < 0.3) {
        const skipIndex = Math.floor(Math.random() * (indices.length - 2)) + 1;
        indices.splice(skipIndex, 1);
      }
      
      // If USC is large, include the last slide with moderate chance for closure
      if (usc > 7 && indices.length < plannedCount && Math.random() < 0.6) {
        const lastIndex = usc - 1;
        if (!indices.includes(lastIndex)) {
          indices.push(lastIndex);
        }
      }
      break;
      
    case 'Clear-all':
      // Watch every slide
      for (let i = 0; i < usc; i++) {
        indices.push(i);
      }
      break;
      
    default:
      // Fallback: watch first few slides
      for (let i = 0; i < Math.min(plannedCount, usc); i++) {
        indices.push(i);
      }
  }
  
  // Ensure we don't exceed planned count
  return indices.slice(0, plannedCount).sort((a, b) => a - b);
}

async function moveToNextSlide(page, session) {
  // Use tap-to-next navigation (per client requirement: "just continue tapping the right side")
  let navigationSuccess = false;
  let attempts = 0;
  const maxAttempts = 3;
  
  while (!navigationSuccess && attempts < maxAttempts) {
    attempts++;
    
    // Method 1: Tap to next slide (right side)
    session.log(`[Navigation] Attempt ${attempts}/${maxAttempts} → Trying tap to next slide`);
    const tapSuccess = await storyTapNext(page, session);
    
    if (tapSuccess) {
    await sleep(rInt(500, 1000));
    
    // Verify slide changed (same account, different slide)
    const newStoryInfo = await page.evaluate(() => {
      const url = window.location.href;
      const storyUser = url.match(/\/stories\/([^\/]+)\//)?.[1] || 'unknown';
      const storyTime = document.querySelector('time')?.textContent || '';
      const storyId = document.querySelector('[data-testid="story-item"]')?.getAttribute('data-testid') || 
                     document.querySelector('[data-testid="story-player"]')?.getAttribute('data-testid') || 
                     'unknown';
      return { user: storyUser, time: storyTime, url, storyId };
    });
    
    // Check if it's the same account but different slide
    const currentStoryInfo = await page.evaluate(() => {
      const url = window.location.href;
      const storyUser = url.match(/\/stories\/([^\/]+)\//)?.[1] || 'unknown';
      const storyTime = document.querySelector('time')?.textContent || '';
      const storyId = document.querySelector('[data-testid="story-item"]')?.getAttribute('data-testid') || 
                     document.querySelector('[data-testid="story-player"]')?.getAttribute('data-testid') || 
                     'unknown';
      return { user: storyUser, time: storyTime, url, storyId };
    });
    
    if (newStoryInfo.user === currentStoryInfo.user && 
        (newStoryInfo.storyId !== currentStoryInfo.storyId || 
         newStoryInfo.time !== currentStoryInfo.time)) {
        session.log(`[Navigation] ✅ Success via tap to next slide`);
      navigationSuccess = true;
        break;
    } else {
        session.log(`[Navigation] ⚠️ Tap didn't change slide (attempt ${attempts})`);
    }
    } else {
      session.log(`[Navigation] ⚠️ Tap to next slide failed (attempt ${attempts})`);
  }
  
    // Method 2: Alternative tap location (if first tap failed)
  if (!navigationSuccess) {
      session.log(`[Navigation] Attempt ${attempts}/${maxAttempts} → Trying alternative tap location`);
    const vpDims = await page.evaluate(() => ({ w: innerWidth || 360, h: innerHeight || 640 }));
    const tapX = rInt(vpDims.w * 0.7, vpDims.w * 0.9);
    const tapY = rInt(vpDims.h * 0.3, vpDims.h * 0.7);
    await touchTapAt(page, tapX, tapY);
    await sleep(1000);
    
    const storyActive = await isStoryActive(page);
    if (storyActive) {
        session.log(`[Navigation] ✅ Success via alternative tap location`);
      navigationSuccess = true;
        break;
      } else {
        session.log(`[Navigation] ⚠️ Alternative tap failed (attempt ${attempts})`);
      }
    }
    
    // Method 3: Different tap location if still failing
    if (!navigationSuccess && attempts < maxAttempts) {
      session.log(`[Navigation] Attempt ${attempts + 1}/${maxAttempts} → Trying third tap location`);
      await sleep(rInt(500, 1000));
      
      const vpDims = await page.evaluate(() => ({ w: innerWidth || 360, h: innerHeight || 640 }));
      const tapX = rInt(vpDims.w * 0.8, vpDims.w * 0.95);
      const tapY = rInt(vpDims.h * 0.4, vpDims.h * 0.6);
      await touchTapAt(page, tapX, tapY);
      await sleep(1000);
      
      const storyActive = await isStoryActive(page);
      if (storyActive) {
        session.log(`[Navigation] ✅ Success via third tap location`);
        navigationSuccess = true;
        break;
      } else {
        session.log(`[Navigation] ⚠️ Third tap location failed (attempt ${attempts + 1})`);
      }
    }
  }
  
  if (!navigationSuccess) {
    session.log(`[Navigation] ❌ Failed to move to next slide after ${maxAttempts} attempts`);
  }
  
  return navigationSuccess;
}

// ============================================================================
// ENHANCED SLIDE NAVIGATION FOR ACCOUNT MODES
// ============================================================================

async function navigateToSpecificSlide(page, targetIndex, currentIndex, session) {
  // Navigate to a specific slide index within the current account
  // This is useful for modes like Skim where we want to jump to middle/last slides
  
  if (targetIndex <= currentIndex) {
    session.log(`[Navigation] Target slide ${targetIndex + 1} is before current ${currentIndex + 1}, cannot navigate backwards`);
    return false;
  }
  
  const slidesToAdvance = targetIndex - currentIndex;
  session.log(`[Navigation] Advancing ${slidesToAdvance} slides to reach target slide ${targetIndex + 1}`);
  
  let successCount = 0;
  for (let i = 0; i < slidesToAdvance; i++) {
    const success = await moveToNextSlide(page, session);
    if (success) {
      successCount++;
      await sleep(rInt(200, 500)); // Brief delay between rapid advances
    } else {
      session.log(`[Navigation] Failed to advance slide ${i + 1}/${slidesToAdvance}`);
      break;
    }
  }
  
  if (successCount === slidesToAdvance) {
    session.log(`[Navigation] ✅ Successfully navigated to target slide ${targetIndex + 1}`);
    return true;
  } else {
    session.log(`[Navigation] ⚠️ Only advanced ${successCount}/${slidesToAdvance} slides`);
    return false;
  }
}

// ============================================================================
// EXIT HANDLING - BOTH BUTTON AND SWIPE METHODS (per client spec §8)
// ============================================================================

// ⚠️ IMPORTANT: Client requires BOTH exit methods - button (60%) and swipe (40%)
// Choose naturally based on fatigue and mood, not just one method
// Navigation uses tap-to-next (right side) as per client requirement

async function moveToNextAccount(page, session) {
  // Choose exit method based on fatigue and mood (per spec §8)
  const useButtonExit = determineExitMethod(session);
  
  if (useButtonExit) {
    session.log(`[Exit] Using button exit (fatigue: ${session.fatigue.toFixed(3)})`);
    return await exitViaCloseButton(page, session);
  } else {
    session.log(`[Exit] Using swipe exit (fatigue: ${session.fatigue.toFixed(3)})`);
    return await exitViaSwipeDown(page, session);
  }
}

function determineExitMethod(session) {
  // Base distribution: ~60% button / ~40% swipe (per spec §8)
  let buttonChance = 0.6;
  
  // If fatigue > 1.0, bias toward swipe (feels "let me out now")
  if (session.fatigue > 1.0) {
    buttonChance -= 0.2; // More likely to swipe when tired
  }
  
  // Mood influence on exit preference
  const moodInfluence = getMoodExitInfluence(session);
  buttonChance += moodInfluence;
  
  // Clamp between 0.2 and 0.8
  buttonChance = Math.max(0.2, Math.min(0.8, buttonChance));
  
  return Math.random() < buttonChance;
}

function getMoodExitInfluence(session) {
  // Different moods prefer different exit methods
  const reelsMood = session.reelsMood.name;
  const storyMood = session.storyMood.name;
  
  let influence = 0;
  
  // Reels mood influence
  switch (reelsMood) {
    case 'WeekendFrenzy':
    case 'MorningCoffeeScroll':
      influence -= 0.1; // Prefer swipe (more energetic)
        break;
    case 'MorningChill':
    case 'EveningRelaxMode':
      influence += 0.1; // Prefer button (more relaxed)
        break;
  }
  
  // Story mood influence
  switch (storyMood) {
    case 'MorningStoryCasual':
    case 'NightStoryCasual':
      influence += 0.05; // Slightly prefer button
      break;
    case 'EveningStoryBinge':
      influence -= 0.05; // Slightly prefer swipe
      break;
  }
  
  return influence;
}

async function exitViaCloseButton(page, session) {
  try {
    // Since only Escape key works reliably, try just 1-2 most likely selectors
    const closeSelectors = [
      'div[role="button"] svg[aria-label="Close"]', // This one is found but not visible
      'button[aria-label="Close"]', // Most common
    ];
    
    let attempts = 0;
    const maxAttempts = 1; // Only 1 attempt since Escape works reliably
    
    while (attempts < maxAttempts) {
      attempts++;
      
      for (let i = 0; i < closeSelectors.length; i++) {
        const selector = closeSelectors[i];
        try {
          session.log(`[Exit] Attempt ${attempts}/${maxAttempts} → Trying close button: ${selector}`);
          
          // Very short timeout since Escape works
          await page.waitForSelector(selector, { timeout: 500 });
        const closeButton = await page.$(selector);
          
        if (closeButton) {
            // Check if button is visible and clickable
            const isVisible = await closeButton.isVisible();
            if (!isVisible) {
              session.log(`[Exit] ⚠️ Selector found but not visible: ${selector}`);
              continue;
            }
            
            // Always click the parent button, not just the svg
            let elementToClick = closeButton;
            if (selector.includes('svg[')) {
              const parentButton = await closeButton.evaluateHandle(el => {
                // Find the closest button or div[role="button"] parent
                let parent = el.parentElement;
                while (parent) {
                  if (parent.tagName === 'BUTTON' || 
                      (parent.tagName === 'DIV' && parent.getAttribute('role') === 'button')) {
                    return parent;
                  }
                  parent = parent.parentElement;
                }
                return el; // Fallback to original element if no parent found
              });
              elementToClick = parentButton.asElement();
            }
            
            await touchTapHandle(page, elementToClick);
            await sleep(rInt(500, 1000)); // Shorter delay
          
          // Verify we're back to main feed
          const backToFeed = await page.evaluate(() => {
            return !document.querySelector('div[role="dialog"]') && 
                   window.location.href.includes('instagram.com') &&
                   !window.location.href.includes('/stories/');
          });
          
          if (backToFeed) {
              session.log(`[Exit] ✅ Success via close button (selector: ${selector})`);
              return true;
            } else {
              session.log(`[Exit] ⚠️ Close button clicked but still in story view: ${selector}`);
          }
        }
      } catch (error) {
          session.log(`[Exit] ⚠️ Selector failed: ${selector} - ${error.message}`);
        // Continue to next selector
        }
      }
    }
    
    // Close button failed - immediately use Escape key fallback
    session.log(`[Exit] ❌ Failed via close button after ${maxAttempts} attempts`);
    session.log(`[Exit] ↩️ Falling back to Escape key`);
    
    try {
      await page.keyboard.press('Escape');
      await sleep(rInt(500, 1000)); // Shorter delay
      
      const backToFeed = await page.evaluate(() => {
        return !document.querySelector('div[role="dialog"]') && 
               window.location.href.includes('instagram.com') &&
               !window.location.href.includes('/stories/');
      });
      
      if (backToFeed) {
        session.log(`[Exit] ✅ Success via Escape key`);
        return true;
      } else {
        session.log(`[Exit] ❌ Failed via Escape key`);
    return false;
      }
  } catch (error) {
      session.log(`[Exit] ❌ Error with Escape key: ${error.message}`);
      return false;
    }
  } catch (error) {
    session.log(`[Exit] ❌ Error in close button: ${error.message}`);
    return false;
  }
}

async function closeStoryViewerAndFindNext(page, session) {
  try {
    session.log(`[Exit] 🚨 Executing fallback: force closing story viewer`);
    
    // Try both exit methods as fallback
    const useButtonExit = Math.random() < 0.5; // 50/50 chance for fallback
    
    if (useButtonExit) {
      session.log(`[Exit] Fallback: trying close button`);
      const buttonSuccess = await exitViaCloseButton(page, session);
      if (buttonSuccess) return true;
    } else {
      session.log(`[Exit] Fallback: trying swipe-down`);
      const swipeSuccess = await exitViaSwipeDown(page, session);
      if (swipeSuccess) return true;
    }
    
    // If first method failed, try the other
    if (useButtonExit) {
      session.log(`[Exit] Fallback: trying swipe-down after button failed`);
      const swipeSuccess = await exitViaSwipeDown(page, session);
      if (swipeSuccess) return true;
    } else {
      session.log(`[Exit] Fallback: trying close button after swipe failed`);
      const buttonSuccess = await exitViaCloseButton(page, session);
      if (buttonSuccess) return true;
    }
    
    // Final fallback: Escape key
    session.log(`[Exit] 🚨 Final fallback: using Escape key`);
    try {
      await page.keyboard.press('Escape');
      await sleep(rInt(500, 1000));
      
      const backToFeed = await page.evaluate(() => {
        return !document.querySelector('div[role="dialog"]') && 
               window.location.href.includes('instagram.com') &&
               !window.location.href.includes('/stories/');
      });
      
      if (backToFeed) {
        session.log(`[Exit] ✅ Success via Escape key fallback`);
        return true;
      } else {
        session.log(`[Exit] ❌ Failed via Escape key fallback`);
        return false;
      }
    } catch (error) {
      session.log(`[Exit] ❌ Error with Escape key fallback: ${error.message}`);
      return false;
    }
  } catch (error) {
    session.log(`[Exit] ❌ Error in fallback: ${error.message}`);
    return false;
  }
}

async function skipToNextAccount(page, session) {
  // Skip current account and try to find next one
  session.log(`[Navigation] Skipping current account...`);
  
  // Try both exit methods for skipping
  const useButtonExit = Math.random() < 0.5; // 50/50 chance for skip
  
  let closed = false;
  
  if (useButtonExit) {
    session.log(`[Navigation] Skip: trying close button`);
    closed = await exitViaCloseButton(page, session);
  } else {
    session.log(`[Navigation] Skip: trying swipe-down`);
    closed = await exitViaSwipeDown(page, session);
  }
  
  // If first method failed, try the other
  if (!closed) {
    if (useButtonExit) {
      session.log(`[Navigation] Skip: trying swipe-down after button failed`);
      closed = await exitViaSwipeDown(page, session);
    } else {
      session.log(`[Navigation] Skip: trying close button after swipe failed`);
      closed = await exitViaCloseButton(page, session);
    }
  }
  
  // Final fallback: Escape key
  if (!closed) {
    try {
      session.log(`[Navigation] Skip: final fallback using Escape key`);
      await page.keyboard.press('Escape');
    await sleep(rInt(500, 1000));
    
      const backToFeed = await page.evaluate(() => {
        return !document.querySelector('div[role="dialog"]') && 
               window.location.href.includes('instagram.com') &&
               !window.location.href.includes('/stories/');
      });
      
      if (backToFeed) {
        session.log(`[Navigation] ✅ Success via Escape key skip`);
        closed = true;
      } else {
        session.log(`[Navigation] ❌ Failed via Escape key skip`);
      }
  } catch (error) {
      session.log(`[Navigation] ❌ Error with Escape key skip: ${error.message}`);
    }
  }
  
  if (closed) {
    session.log(`[Navigation] ✅ Successfully returned to main feed for skip`);
  } else {
    session.log(`[Navigation] ❌ Still in story view after all skip attempts`);
  }
  
  // Don't immediately navigate - let the main loop handle delays
  return closed;
}

async function exitViaSwipeDown(page, session) {
  try {
    session.log(`[Exit] Attempting swipe-down exit`);
    
    // Get viewport dimensions
    const vpDims = await page.evaluate(() => ({ w: innerWidth || 360, h: innerHeight || 640 }));
    
    // Swipe top→down starting in the upper area (per spec §8)
    const startX = rInt(vpDims.w * 0.4, vpDims.w * 0.6); // Center area
    const startY = rInt(vpDims.h * 0.1, vpDims.h * 0.2); // Upper area
    const endX = startX + rInt(-20, 20); // Slight horizontal variation
    const endY = vpDims.h * 0.8; // End near bottom
    
    try {
      const cdp = await page.target().createCDPSession();
      
      // Touch start in upper area
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ 
          x: startX, 
          y: startY, 
          id: 1, 
          force: rFloat(0.4, 0.7), 
          radiusX: rInt(3, 6), 
          radiusY: rInt(3, 6) 
        }],
      });
      
      // Move down with realistic timing
      const steps = 8;
      for (let i = 1; i <= steps; i++) {
        const progress = i / steps;
        const currentY = startY + (endY - startY) * progress;
        const currentX = startX + (endX - startX) * progress;
        
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ 
            x: currentX, 
            y: currentY, 
            id: 1, 
            force: rFloat(0.4, 0.7), 
            radiusX: rInt(3, 6), 
            radiusY: rInt(3, 6) 
          }],
        });
        
        await sleep(rInt(20, 40)); // Realistic movement timing
      }
      
      // Touch end
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      
      await sleep(rInt(500, 1000));
      
      // Verify we're back to main feed
    const backToFeed = await page.evaluate(() => {
      return !document.querySelector('div[role="dialog"]') && 
             window.location.href.includes('instagram.com') &&
             !window.location.href.includes('/stories/');
    });
    
    if (backToFeed) {
        session.log(`[Exit] ✅ Success via swipe-down exit`);
        return true;
      } else {
        session.log(`[Exit] ⚠️ Swipe-down didn't exit story view`);
        return false;
    }
    
  } catch (error) {
      session.log(`[Exit] ❌ Swipe-down failed: ${error.message}`);
    return false;
      }
    } catch (error) {
    session.log(`[Exit] ❌ Error in swipe-down: ${error.message}`);
    return false;
    }
}

module.exports = {
  watchStories,
  getStoryMood,
  selectEmojiReaction,
  EMOJI_REACTIONS
};
