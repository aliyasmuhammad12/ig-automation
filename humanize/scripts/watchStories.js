// humanize/scripts/watchStories.js
// Story watching automation with Progressive Boredom Multiplier (PBM) system
// and Smart Navigation System
// 
// PBM System Overview:
// - Never exit accounts due to boredom (only session-level exits)
// - Progressive speed acceleration as boredom grows within accounts
// - Skip streak acceleration (2% faster per consecutive skip)
// - Micro outliers (3% chance of slower delays)
// - Rare slowdowns (7% chance, 2-4 taps, first tap forced Long dwell)
// - 25% boredom carried over between accounts
// - Session exits only when SC ≤ 1.0 or fatigue ≥ 1.25
//
// Smart Navigation System:
// - Human-like retry behavior with progressive patience
// - 4 attempts with varying tap positions and timing
// - 18-second max time per slide to prevent infinite loops
// - Graceful fallback: skip problematic stories, not entire accounts
// - Account-level problem detection (skip account after 3 consecutive failures)
// - Natural flow preservation without abrupt exits

const { getMood } = require('../moods');
const { mobileClick } = require('../../helpers/mobileClick');

const now = () => Date.now();
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const rFloat = (a, b) => a + Math.random() * (b - a);
const rInt = (a, b) => Math.floor(rFloat(a, b + 1));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const clamp01 = (n) => clamp(n, 0, 1);

// ============================================================================
// CONTENT DETECTION FUNCTIONS
// ============================================================================

/**
 * Analyzes story content and extracts bounding boxes of problematic elements
 * @param {ElementHandle} element - The story element to analyze
 * @returns {Promise<Object>} - Content analysis with bounding boxes
 */
async function analyzeStoryContent(element) {
  try {
    const contentAnalysis = await element.evaluate(el => {
      const html = el.outerHTML.toLowerCase();
      const textContent = el.textContent?.toLowerCase() || '';
      const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
      
      // Find problematic elements and get their bounding boxes
      const problematicElements = [];
      
      // Check for video elements (reels)
      const videoElements = el.querySelectorAll('video');
      videoElements.forEach(video => {
        const rect = video.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          problematicElements.push({
            type: 'reel',
            x1: rect.left,
            y1: rect.top,
            x2: rect.right,
            y2: rect.bottom,
            confidence: 0.9
          });
        }
      });
      
      // Check for play button indicators
      const playButtons = el.querySelectorAll('svg[aria-label*="play"], svg[aria-label*="Play"], button[aria-label*="play"], button[aria-label*="Play"]');
      playButtons.forEach(button => {
        const rect = button.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          problematicElements.push({
            type: 'play_button',
            x1: rect.left,
            y1: rect.top,
            x2: rect.right,
            y2: rect.bottom,
            confidence: 0.8
          });
        }
      });
      
      // Check for clickable links that might be mentions
      const clickableLinks = el.querySelectorAll('a[href*="/"]');
      clickableLinks.forEach(link => {
        const rect = link.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          problematicElements.push({
            type: 'mention_link',
            x1: rect.left,
            y1: rect.top,
            x2: rect.right,
            y2: rect.bottom,
            confidence: 0.7
          });
        }
      });
      
      // Check for @ symbols in text content (potential mentions)
      const textNodes = el.querySelectorAll('*');
      textNodes.forEach(node => {
        if (node.textContent && node.textContent.includes('@')) {
          const rect = node.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            problematicElements.push({
              type: 'mention_text',
              x1: rect.left,
              y1: rect.top,
              x2: rect.right,
              y2: rect.bottom,
              confidence: 0.6
            });
          }
        }
      });
      
      // Check for interactive buttons that might cause navigation issues
      const interactiveButtons = el.querySelectorAll('button, [role="button"]');
      interactiveButtons.forEach(button => {
        // Skip if it's a story navigation button (close, next, etc.)
        const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
        const isNavigationButton = ariaLabel.includes('close') || 
                                 ariaLabel.includes('next') || 
                                 ariaLabel.includes('previous') ||
                                 ariaLabel.includes('back');
        
        if (!isNavigationButton) {
          const rect = button.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            problematicElements.push({
              type: 'interactive_button',
              x1: rect.left,
              y1: rect.top,
              x2: rect.right,
              y2: rect.bottom,
              confidence: 0.5
            });
          }
        }
      });
      
      // Get viewport dimensions
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
      };
      
      return {
        hasProblematicContent: problematicElements.length > 0,
        problematicElements,
        viewport,
        totalElements: problematicElements.length,
        debug: {
          html: html.substring(0, 200),
          textContent: textContent.substring(0, 100),
          ariaLabel: ariaLabel.substring(0, 100),
          videoElements: videoElements.length,
          playButtons: playButtons.length,
          clickableLinks: clickableLinks.length,
          interactiveButtons: interactiveButtons.length
        }
      };
    });
    
    return contentAnalysis;
  } catch (error) {
    return {
      hasProblematicContent: false,
      problematicElements: [],
      viewport: { width: 375, height: 812 },
      totalElements: 0,
      debug: { error: error.message }
    };
  }
}

/**
 * Calculates safe tap zones by excluding problematic elements
 * @param {Array} problematicElements - Array of bounding boxes to avoid
 * @param {Object} viewport - Viewport dimensions
 * @returns {Object} - Safe tap zones
 */
function getSafeTapZones(problematicElements, viewport) {
  const { width, height } = viewport;
  
  // Debug: Log problematic elements
  console.log(`[Debug] getSafeTapZones: ${problematicElements.length} elements, viewport: ${width}x${height}`);
  if (problematicElements.length > 0) {
    const firstElement = problematicElements[0];
    console.log(`[Debug] First element: ${firstElement.type} at (${firstElement.x1},${firstElement.y1},${firstElement.x2},${firstElement.y2})`);
  }
  
  // Define default safe zones (right side for story navigation)
  const defaultZones = [
    {
      name: 'right_center',
      x1: width * 0.75,
      y1: height * 0.3,
      x2: width * 0.95,
      y2: height * 0.7,
      priority: 1
    },
    {
      name: 'right_upper',
      x1: width * 0.75,
      y1: height * 0.1,
      x2: width * 0.95,
      y2: height * 0.4,
      priority: 2
    },
    {
      name: 'right_lower',
      x1: width * 0.75,
      y1: height * 0.6,
      x2: width * 0.95,
      y2: height * 0.9,
      priority: 3
    },
    {
      name: 'center_right',
      x1: width * 0.6,
      y1: height * 0.4,
      x2: width * 0.8,
      y2: height * 0.6,
      priority: 4
    }
  ];
  
  // Filter out zones that overlap with problematic elements
  const safeZones = defaultZones.filter(zone => {
    return !problematicElements.some(element => {
      // Check if zone overlaps with problematic element
      const overlaps = !(zone.x2 < element.x1 || zone.x1 > element.x2 || 
                        zone.y2 < element.y1 || zone.y1 > element.y2);
      return overlaps;
    });
  });
  
  // If no safe zones found, create a minimal safe zone
  if (safeZones.length === 0) {
    // Find the rightmost edge of all problematic elements
    const validElements = problematicElements.filter(el => 
      !isNaN(el.x1) && !isNaN(el.x2) && !isNaN(el.y1) && !isNaN(el.y2) &&
      el.x1 >= 0 && el.x2 >= 0 && el.y1 >= 0 && el.y2 >= 0
    );
    
    let rightmostEdge = 0;
    if (validElements.length > 0) {
      rightmostEdge = Math.max(...validElements.map(el => el.x2));
    }
    
    // Create a safe zone to the right of all problematic elements
    // If the screen is too crowded, use a small corner zone
    const fallbackZone = {
      name: 'fallback_right',
      x1: Math.min(rightmostEdge + 10, width * 0.8),
      y1: height * 0.3,
      x2: width * 0.95,
      y2: height * 0.7,
      priority: 0
    };
    
    // Validate the fallback zone
    if (isNaN(fallbackZone.x1) || isNaN(fallbackZone.x2) || 
        isNaN(fallbackZone.y1) || isNaN(fallbackZone.y2) ||
        fallbackZone.x1 >= fallbackZone.x2 || fallbackZone.y1 >= fallbackZone.y2) {
      // Ultimate fallback: use a small corner zone
      fallbackZone.x1 = width * 0.85;
      fallbackZone.y1 = height * 0.4;
      fallbackZone.x2 = width * 0.95;
      fallbackZone.y2 = height * 0.6;
    }
    
    safeZones.push(fallbackZone);
  }
  
  // Sort by priority (lower number = higher priority)
  safeZones.sort((a, b) => a.priority - b.priority);
  
  return {
    zones: safeZones,
    totalZones: safeZones.length,
    problematicElements: problematicElements.length,
    viewport
  };
}

/**
 * Finds a safe zone for story navigation (avoiding interactive elements)
 * @param {Page} page - Puppeteer page object
 * @returns {Promise<Object>} - Safe zone coordinates
 */
async function findSafeNavigationZone(page) {
  try {
    const safeZone = await page.evaluate(() => {
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
      };
      
      // Define safe zones (avoiding common interactive areas)
      const safeZones = [
        // Right side safe zone (most common for story navigation)
        {
          x: [viewport.width * 0.75, viewport.width * 0.95],
          y: [viewport.height * 0.3, viewport.height * 0.7],
          priority: 1
        },
        // Center-right safe zone
        {
          x: [viewport.width * 0.6, viewport.width * 0.8],
          y: [viewport.height * 0.4, viewport.height * 0.6],
          priority: 2
        },
        // Left side safe zone (fallback)
        {
          x: [viewport.width * 0.05, viewport.width * 0.25],
          y: [viewport.height * 0.3, viewport.height * 0.7],
          priority: 3
        }
      ];
      
      // Check for interactive elements in each zone
      const interactiveElements = document.querySelectorAll('button, a, [role="button"], input, select, textarea');
      const elementPositions = Array.from(interactiveElements).map(el => {
        const rect = el.getBoundingClientRect();
        return {
          x: [rect.left, rect.right],
          y: [rect.top, rect.bottom],
          tagName: el.tagName,
          role: el.getAttribute('role') || 'none'
        };
      });
      
      // Find the safest zone
      let bestZone = safeZones[0];
      let minInteractions = Infinity;
      
      for (const zone of safeZones) {
        let interactions = 0;
        
        for (const element of elementPositions) {
          // Check if element overlaps with zone
          const overlaps = !(element.x[1] < zone.x[0] || element.x[0] > zone.x[1] || 
                           element.y[1] < zone.y[0] || element.y[0] > zone.y[1]);
          
          if (overlaps) {
            interactions++;
          }
        }
        
        if (interactions < minInteractions) {
          minInteractions = interactions;
          bestZone = zone;
        }
      }
      
      return {
        zone: bestZone,
        totalInteractiveElements: elementPositions.length,
        interactionsInZone: minInteractions,
        viewport
      };
    });
    
    return safeZone;
  } catch (error) {
    // Fallback to default safe zone
    return {
      zone: {
        x: [0.75, 0.95],
        y: [0.3, 0.7],
        priority: 1
      },
      totalInteractiveElements: 0,
      interactionsInZone: 0,
      viewport: { width: 375, height: 812 }
    };
  }
}

// ============================================================================
// FEATURE FLAG
// ============================================================================

const FEATURE_FLAGS = {
  storySCv1: true, // Enabled for testing the new system
  useAdvancedRightTap: true // Advanced human-like tap system
};

// ============================================================================
// CONFIGURATION - Single object of tunables
// ============================================================================

const SC_CONFIG = {
  // Moods by local time
  moods: {
    Morning: { // 06-10
      scRange: [12, 16, 22], // min, mode, max (triangular)
      startFatigue: 0.14
    },
    Midday: { // 10-18
      scRange: [16, 20, 28],
      startFatigue: 0.12
    },
    Evening: { // 18-23
      scRange: [22, 28, 42],
      startFatigue: 0.08
    }
  },
  
  // Dwell profiles (seconds; per-slide costs)
  dwellProfiles: {
    Quick: {
      duration: [0.8, 1.8],
      scCost: [0.8, 1.1],
      fatigue: [0.012, 0.018]
    },
    Normal: {
      duration: [2.2, 5.5],
      scCost: [1.2, 1.6],
      fatigue: [0.020, 0.030]
    },
    Long: {
      duration: [6.0, 12.0],
      scCost: [1.8, 2.4],
      fatigue: [0.032, 0.045]
    }
  },
  
  // Base dwell choice probabilities (pre-pressure)
  baseDwellProbs: {
    Quick: 0.35,
    Normal: 0.55,
    Long: 0.10
  },
  
  // Skip propensity weights
  skipWeights: {
    intercept: -0.55,
    noise: 0.08,
    fatigue: 0.65,
    sc: 0.55,
    slideIdx: 0.45,
    boredom: 0.70
  },
  
  // Session stops
  fatigueSoftStop: 1.25,
  fatigueHardStop: 1.40,
  
  // Micro-pause
  microPauseChance: 0.15,
  microPauseDuration: [0.4, 1.2],
  microPauseFatigue: [0.004, 0.008],
  
  // Interest spike
  interestSpikeChance: 0.10,
  interestSpikeSkipReduction: 0.35,
  interestSpikeBoredomReduction: 0.20,
  
  // StreakBreaker
  streakBreakerChance: 0.08,
  streakBreakerDuration: [2, 4],
  rareLongRunChance: 0.10,
  rareLongRunDuration: [4, 6],
  
  // Between-Account Recovery (BAR)
  barDecayFactors: [1.00, 0.70, 0.50, 0.35, 0.25],
  barMaxPerSession: 4,
  barPerHopCap: 2.2,
  barSoftCapMultiplier: 0.85,
  barHardCapMultiplier: 1.25,
  socialRechargeChance: 0.05,
  socialRechargeBoost: [0.8, 1.4],
  
  // Progressive Boredom Multiplier (PBM) - NEW SYSTEM
  pbm: {
    warmUpSlides: 5,           // i0: warm-up window
    fullRampDepth: 25,         // i1: full ramp depth
    maxSpeedUp: 0.50,          // s_max: up to 50% faster than baseline
    skipAcceleration: 0.98,    // ρ: ~2% faster per consecutive skip
    floor: 0.40,               // m_floor: never faster than 40% of baseline
    boredomThreshold: 1.10,    // BT: boredom normalization threshold
    microOutlierChance: 0.03,  // 3% chance of micro slow blips
    microOutlierRange: [1.1, 1.6], // U[1.1, 1.6] multiplier
    rareSlowdownChance: 0.07,  // 7% chance per slide when not already slowing
    rareSlowdownDuration: [2, 4], // 2-4 taps (15% extend to 4-6)
    rareSlowdownRange: [1.8, 3.0], // U[1.8, 3.0] multiplier
    rareSlowdownExtendChance: 0.15, // 15% chance to extend to 4-6 taps
    boredomCarryOver: 0.25     // 25% boredom carried to next account
  },
  
  // Account exit (REMOVED - no longer used)
  // boredomExitThreshold: 1.10,
  // boredomExitFatigueThreshold: 0.9,
  // boredomExitScThreshold: 2,
  
  // Navigation (Smart Navigation System)
  urlChangeTimeout: 1800,
  urlPollInterval: [80, 150],
  betweenAccountsDelay: [600, 2200],
  
  // Advanced Right-Side Tap Randomization System
  rightTap: {
    // ROI (Region of Interest) - proportional to viewport
    roi: {
      x: [0.82, 0.96],  // x ∈ [0.82, 0.96] * width
      y: [0.30, 0.78]   // y ∈ [0.30, 0.78] * height
    },
    // Exclusion bands (never tap here)
    safety: {
      top: 0.12,         // y < 0.12 * height
      bottom: 0.88,      // y > 0.88 * height
      right: 0.985       // x > 0.985 * width
    },
    // Session-varying weights (not fixed numbers)
    weights: {
      base: { mean: 0.70, std: 0.04, min: 0.60, max: 0.80 },  // wb ~ N(0.70, 0.04) → [0.60, 0.80]
      rare: { alpha: 2, beta: 30, min: 0.02, max: 0.10 },      // wr ~ Beta(2, 30) → [0.02, 0.10]
      // wide = 1 - wb - wr (typically lands near ~0.20)
    },
    // Hazard thresholds (boost probabilities if categories not used)
    hazards: {
      wideThreshold: 12,  // +5% to Wide after 12 taps without
      rareThreshold: 40,  // +2% to Rare after 40 taps without
      wideBoost: 0.05,
      rareBoost: 0.02
    },
    // Session anchor initialization
    anchor: {
      x: { mean: 0.885, std: 0.010, min: 0.84, max: 0.95 },   // x ~ N(0.885, 0.010) → [0.84, 0.95]
      y: { mean: 0.50, std: 0.040, min: 0.36, max: 0.64 }     // y ~ N(0.50, 0.040) → [0.36, 0.64]
    },
    // Micro-peaks configuration
    microPeaks: {
      count: 3,                    // K = 3 micro-peaks
      deltaX: { min: -20, max: 16 },  // Δx_i ~ U([-20 px, +16 px]) - slightly biased inward
      deltaY: {                    // Δy_i ~ mixture: 60% upper, 40% lower
        upper: { prob: 0.60, range: [-60, -30] },
        lower: { prob: 0.40, range: [30, 60] }
      },
      weights: [5, 2, 2]          // Dirichlet([5, 2, 2]) → peak 0 ≈ dominant, others smaller
    },
    // Micro-offsets distribution
    offsets: {
      dominantProb: { min: 0.45, max: 0.65 },  // p0 ~ U([0.45, 0.65])
      pixelOffsets: [1, 2, 3, 4],              // {±1, ±2, ±3, ±4} px
      weights: [0.22, 0.14, 0.11, 0.08]       // Decaying weights before renormalization
    },
    // Stickiness (probability to reuse same micro-peak)
    stickiness: { min: 0.70, max: 0.85 },      // s ~ U([0.70, 0.85])
    // Timing configuration
    timing: {
      baseDelay: { min: 160, max: 210 },       // Base delay range: [160, 210] ms
      attemptMultiplier: 0.25,                 // 1 + 0.25*(attempt-1)
      fatigueMultiplier: 0.30,                 // 1 + 0.30*f with f ∈ [0,1]
      lookPause: {
        chance: { min: 0.010, max: 0.025 },    // plook ~ U([0.010, 0.025])
        duration: { min: 800, max: 1500 }      // [800, 1500] ms when triggered
      }
    },
    // Anti-robot adjustments
    antiRobot: {
      minDistance: 14,              // Minimum distance from last tap (px)
      minDistanceProb: 0.80,        // 80% probability to enforce min distance
      resampleAttempts: 6           // Max attempts to resample if safety violated
    },
    // Wide zone configuration (elliptical Gaussian)
    wideZone: {
      sigmaX: 0.04,                 // σx ≈ 0.04 * width
      sigmaY: 0.12                  // σy ≈ 0.12 * height
    },
    // Rare zone configuration
    rareZones: {
      edgeNear: {                   // Edge-near: x ~ N(0.975*width, 0.006*width), y ~ U([0.25, 0.75]*height)
        x: { mean: 0.975, std: 0.006 },
        y: { min: 0.25, max: 0.75 }
      },
      innerRight: {                 // Inner-right: x ~ N(0.78*width, 0.02*width), y ~ N(anchorY, 0.12*height)
        x: { mean: 0.78, std: 0.02 },
        y: { std: 0.12 }
      },
      highLow: {                    // High-right or Low-right: x ~ N(anchorX, 0.02*width), y ~ N(anchorY ± 0.22*height, 0.06*height)
        x: { std: 0.02 },
        y: { offset: 0.22, std: 0.06 }
      }
    }
  }
};

// ============================================================================
// SESSION STATE MANAGEMENT
// ============================================================================

class StorySession {
  constructor(accountId, durationSeconds = 60) {
    this.accountId = accountId;
    this.durationSeconds = durationSeconds;
    this.startTime = now();
    
    // Initialize logging
    this.logs = [];
    
    // Get current mood by local time
    this.mood = this.getMoodByTime();
    
    // Session-level state (persist across accounts)
    this.scRemaining = this.initializeSC();
    this.fatigue = this.mood.startFatigue;
    this.rareLongRunToken = Math.random() < SC_CONFIG.rareLongRunChance;
    this.streakBreaker = { active: false, slidesLeft: 0 };
    this.barCount = 0;
    this.socialRechargeUsed = false;
    this.scStartMode = this.mood.scRange[1]; // mode value for caps
    
    // Per-account state (reset on new account)
    this.resetAccountState();
    
    // Initialize advanced right-side tap randomization system
    this.initializeRightTapProfile();
    
    this.logSessionStart();
  }
  
  getMoodByTime() {
    const hour = new Date().getHours();
    
    if (hour >= 6 && hour < 10) {
      return SC_CONFIG.moods.Morning;
    } else if (hour >= 10 && hour < 18) {
      return SC_CONFIG.moods.Midday;
    } else {
      return SC_CONFIG.moods.Evening;
    }
  }
  
  initializeSC() {
    const [min, mode, max] = this.mood.scRange;
    
    // Triangular distribution sampling
    const u = Math.random();
    let sc;
    
    if (u < (mode - min) / (max - min)) {
      sc = min + Math.sqrt(u * (max - min) * (mode - min));
    } else {
      sc = max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    }
    
    this.log(`[SC] Initialized: ${sc.toFixed(2)} SC (triangular: ${min}, ${mode}, ${max})`);
    return sc;
  }
  
  resetAccountState() {
    this.slideIdx = 0;
    this.boredom = 0;
    this.usedRareLongRun = false;
    this.prevStoryUrl = '';
    this.scSpentHere = 0;
    this.slidesWatchedHere = 0;
    
    // PBM state (per-account)
    this.skipStreak = 0;           // S: consecutive skip streak
    this.rareSlowdown = {          // Rare slowdown event state
      active: false,
      tapsLeft: 0,
      forcedLongDwell: false       // Whether we need to force Long dwell on first tap
    };
    
    // Smart navigation state (per-account)
    this.navigationFailures = 0;   // Count of failed navigation attempts
    this.maxNavigationFailures = 3; // Skip account after 3 consecutive failures
  }
  
  log(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log(logEntry);
    this.logs.push(logEntry);
  }
  
  logSessionStart() {
    this.log(`[Session] Starting story session for ${this.accountId}`);
    this.log(`[Mood] ${this.getMoodName()}: SC ${this.scRemaining.toFixed(2)}, fatigue ${this.fatigue.toFixed(3)}`);
    this.log(`[State] Rare token: ${this.rareLongRunToken}, BAR count: ${this.barCount}`);
  }
  
  getMoodName() {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 10) return 'Morning';
    if (hour >= 10 && hour < 18) return 'Midday';
    return 'Evening';
  }
  
  logAccountExit(username, slides, scSpent, scAfter, fatigueAfter, barApplied, reason) {
    this.log(`[stories] user=${username} slides=${slides} sc_spent=${scSpent.toFixed(2)} sc_after=${scAfter.toFixed(2)} fatigue_after=${fatigueAfter.toFixed(3)} bar=${barApplied.toFixed(2)} reason=${reason}`);
  }
  
  /**
   * Initialize the advanced right-side tap randomization profile for this session
   * Creates session-specific anchor points, micro-peaks, and statistical parameters
   */
  initializeRightTapProfile() {
    const config = SC_CONFIG.rightTap;
    
    // Initialize session-specific anchor point (dominant center)
    const anchorX = this.sampleNormal(
      config.anchor.x.mean, 
      config.anchor.x.std, 
      config.anchor.x.min, 
      config.anchor.x.max
    );
    const anchorY = this.sampleNormal(
      config.anchor.y.mean, 
      config.anchor.y.std, 
      config.anchor.y.min, 
      config.anchor.y.max
    );
    
    // Create 3 micro-peaks relative to the anchor
    const microPeaks = [];
    for (let i = 0; i < config.microPeaks.count; i++) {
      // Δx_i ~ U([-20 px, +16 px]) - slightly biased inward vs edge
      const deltaX = rInt(config.microPeaks.deltaX.min, config.microPeaks.deltaX.max);
      
      // Δy_i ~ mixture: 60% upper [-60, -30], 40% lower [+30, +60]
      let deltaY;
      if (Math.random() < config.microPeaks.deltaY.upper.prob) {
        deltaY = rInt(config.microPeaks.deltaY.upper.range[0], config.microPeaks.deltaY.upper.range[1]);
  } else {
        deltaY = rInt(config.microPeaks.deltaY.lower.range[0], config.microPeaks.deltaY.lower.range[1]);
      }
      
      microPeaks.push({ deltaX, deltaY });
    }
    
    // Draw peak weights via Dirichlet: w ~ Dirichlet([5, 2, 2])
    const peakWeights = this.sampleDirichlet(config.microPeaks.weights);
    
    // Sample session-varying weights
    const baseWeight = this.sampleNormal(
      config.weights.base.mean, 
      config.weights.base.std, 
      config.weights.base.min, 
      config.weights.base.max
    );
    const rareWeight = this.sampleBeta(
      config.weights.rare.alpha, 
      config.weights.rare.beta, 
      config.weights.rare.min, 
      config.weights.rare.max
    );
    const wideWeight = 1 - baseWeight - rareWeight; // Automatically calculated
    
    // Define discrete micro-offsets distribution per axis
    const dominantProb = rFloat(config.offsets.dominantProb.min, config.offsets.dominantProb.max);
    const remainingMass = 1 - dominantProb;
    
    // Split remaining mass over offsets {±1, ±2, ±3, ±4} px with decaying weights
    const offsetWeights = config.offsets.weights.map(w => w * remainingMass);
    const totalOffsetWeight = offsetWeights.reduce((sum, w) => sum + w, 0);
    
    // Renormalize so p0 + 2*(p1+p2+p3+p4) = 1
    const normalizedOffsetWeights = offsetWeights.map(w => w / totalOffsetWeight);
    
    // Sample other session constants
    const stickiness = rFloat(config.stickiness.min, config.stickiness.max);
    const lookPauseChance = rFloat(config.timing.lookPause.chance.min, config.timing.lookPause.chance.max);
    
    // Store the complete tap profile
    this.rightTapProfile = {
      // Session anchor and micro-peaks
      anchor: { x: anchorX, y: anchorY },
      microPeaks: microPeaks,
      peakWeights: peakWeights,
      
      // Session weights
      weights: { base: baseWeight, wide: wideWeight, rare: rareWeight },
      
      // Micro-offset distribution
      offsetDist: {
        dominantProb: dominantProb,
        pixelOffsets: config.offsets.pixelOffsets,
        weights: normalizedOffsetWeights
      },
      
      // Session constants
      stickiness: stickiness,
      lookPauseChance: lookPauseChance,
      
      // Timing constants
      baseDelayRange: config.timing.baseDelay,
      attemptMultiplier: config.timing.attemptMultiplier,
      fatigueMultiplier: config.timing.fatigueMultiplier,
      lookPauseDuration: config.timing.lookPause.duration,
      
      // Anti-robot settings
      minDistance: config.antiRobot.minDistance,
      minDistanceProb: config.antiRobot.minDistanceProb,
      resampleAttempts: config.antiRobot.resampleAttempts,
      
      // Hazard tracking
      tapsSinceWide: 0,
      tapsSinceRare: 0,
      
      // State tracking
      lastPeakIdx: null,
      lastTap: null
    };
    
    this.log(`[TapProfile] Initialized: anchor(${anchorX.toFixed(3)}, ${anchorY.toFixed(3)}), weights(B:${baseWeight.toFixed(2)}, W:${wideWeight.toFixed(2)}, R:${rareWeight.toFixed(2)})`);
  }
  
  /**
   * Sample from normal distribution with clamping
   */
  sampleNormal(mean, std, min, max) {
    // Box-Muller transform for normal distribution
    let u1, u2;
    do {
      u1 = Math.random();
      u2 = Math.random();
    } while (u1 === 0);
    
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const value = mean + z0 * std;
    
    return clamp(value, min, max);
  }
  
  /**
   * Sample from beta distribution with clamping
   */
  sampleBeta(alpha, beta, min, max) {
    // Use rejection sampling for beta distribution
    let x, y;
    do {
      x = Math.pow(Math.random(), 1.0 / alpha);
      y = Math.pow(Math.random(), 1.0 / beta);
    } while (x + y > 1.0);
    
    const value = x / (x + y);
    return min + value * (max - min);
  }
  
  /**
   * Sample from Dirichlet distribution
   */
  sampleDirichlet(alpha) {
    const gammaSamples = alpha.map(a => this.sampleGamma(a, 1.0));
    const sum = gammaSamples.reduce((s, x) => s + x, 0);
    return gammaSamples.map(x => x / sum);
  }
  
  /**
   * Sample from gamma distribution (helper for Dirichlet)
   */
  sampleGamma(alpha, beta) {
    // Marsaglia and Tsang's method
    if (alpha < 1) {
      return this.sampleGamma(1 + alpha, beta) * Math.pow(Math.random(), 1.0 / alpha);
    }
    
    const d = alpha - 1.0 / 3.0;
    const c = 1.0 / Math.sqrt(9.0 * d);
    
    let x, v, u;
    do {
      x = this.sampleNormal(0, 1, -Infinity, Infinity);
      v = 1.0 + c * x;
    } while (v <= 0);
    
    v = v * v * v;
    u = Math.random();
    
    if (u < 1.0 - 0.0331 * x * x * x * x) {
      return beta * d * v;
    }
    
    if (Math.log(u) < 0.5 * x * x + d * (1.0 - v + Math.log(v))) {
      return beta * d * v;
    }
    
    return this.sampleGamma(alpha, beta);
  }
}

// ============================================================================
// DWELL DECISION LOGIC
// ============================================================================

function chooseDwellCategory(session) {
  let probs = { ...SC_CONFIG.baseDwellProbs };
  
  // Apply pressure multipliers
  if (session.fatigue >= 0.9 || session.scRemaining <= 3) {
    // High pressure: prefer quick
    probs.Quick *= 1.6;
    probs.Normal *= 0.8;
    probs.Long *= 0.6;
  } else if (session.fatigue <= 0.4 && session.scRemaining >= 15 && session.slideIdx <= 2) {
    // Low pressure: prefer long
    probs.Quick *= 0.8;
    probs.Normal *= 1.0;
    probs.Long *= 1.4;
  }
  
  // Renormalize
  const total = Object.values(probs).reduce((sum, p) => sum + p, 0);
  Object.keys(probs).forEach(key => probs[key] /= total);
  
  // Sample
  const roll = Math.random();
  let cumulative = 0;
  for (const [category, prob] of Object.entries(probs)) {
    cumulative += prob;
    if (roll <= cumulative) {
      return category;
    }
  }
  
  return 'Normal'; // Fallback
}

function sampleDwellValues(category) {
  const profile = SC_CONFIG.dwellProfiles[category];
  return {
    duration: rFloat(profile.duration[0], profile.duration[1]),
    scCost: rFloat(profile.scCost[0], profile.scCost[1]),
    fatigue: rFloat(profile.fatigue[0], profile.fatigue[1])
  };
}

// ============================================================================
// PROGRESSIVE BOREDOM MULTIPLIER (PBM) SYSTEM
// ============================================================================

function computePBM(session) {
  const pbm = SC_CONFIG.pbm;
  
  // Warm-up window: for i ≤ 5, set PBM = 1.00 (no acceleration)
  if (session.slideIdx < pbm.warmUpSlides) {
    return 1.00;
  }
  
  // Normalize boredom and depth
  const BN_code = clamp(session.boredom / pbm.boredomThreshold, 0, 1);
  const BN_depth = clamp((session.slideIdx - pbm.warmUpSlides) / (pbm.fullRampDepth - pbm.warmUpSlides), 0, 1);
  
  // Fuse them without overshooting
  const BN_eff = 1 - (1 - BN_code) * (1 - BN_depth);
  
  // Turn boredom into speed-up and add streak acceleration
  const m_bored = 1 - pbm.maxSpeedUp * BN_eff;
  const m_streak = Math.pow(pbm.skipAcceleration, session.skipStreak);
  
  // Clamp to safe range
  const pbmValue = clamp(m_bored * m_streak, pbm.floor, 1.00);
  
  session.log(`[PBM] i=${session.slideIdx}, boredom=${session.boredom.toFixed(2)}, BN_code=${BN_code.toFixed(2)}, BN_depth=${BN_depth.toFixed(2)}, BN_eff=${BN_eff.toFixed(2)}, m_bored=${m_bored.toFixed(2)}, m_streak=${m_streak.toFixed(3)}, PBM=${pbmValue.toFixed(3)}`);
  
  return pbmValue;
}

function shouldTriggerRareSlowdown(session) {
  const pbm = SC_CONFIG.pbm;
  
  // Don't trigger if already in a slowdown
  if (session.rareSlowdown.active) {
    return false;
  }
  
  // 7% chance per slide
  return Math.random() < pbm.rareSlowdownChance;
}

function startRareSlowdown(session) {
  const pbm = SC_CONFIG.pbm;
  
  // Duration: 2-4 taps (15% extend to 4-6)
  let duration = rInt(pbm.rareSlowdownDuration[0], pbm.rareSlowdownDuration[1]);
  if (Math.random() < pbm.rareSlowdownExtendChance) {
    duration = rInt(4, 6);
  }
  
  session.rareSlowdown.active = true;
  session.rareSlowdown.tapsLeft = duration;
  
  session.rareSlowdown.forcedLongDwell = true; // Force Long dwell on first tap
  
  session.log(`[RareSlowdown] Started: ${duration} taps, will force Long dwell on first tap`);
}

function applyMicroOutlier(baselineDelay, session) {
  const pbm = SC_CONFIG.pbm;
  
  // 3% chance of micro slow blips (only if no slowdown is active)
  if (Math.random() < pbm.microOutlierChance) {
    const multiplier = rFloat(pbm.microOutlierRange[0], pbm.microOutlierRange[1]);
    const newDelay = Math.max(baselineDelay, baselineDelay * multiplier);
    session.log(`[MicroOutlier] Applied: ${baselineDelay.toFixed(0)}ms → ${newDelay.toFixed(0)}ms (${multiplier.toFixed(2)}x)`);
    return newDelay;
  }
  
  return baselineDelay;
}

// ============================================================================
// SKIP DECISION LOGIC
// ============================================================================

function computeSkipPropensity(session) {
  const weights = SC_CONFIG.skipWeights;
  
  // Start with intercept
  let sum = weights.intercept;
  
  // Add weighted factors
  sum += weights.fatigue * clamp(session.fatigue, 0, 1.5);
  sum += weights.sc * clamp01(1 - session.scRemaining / 20);
  sum += weights.slideIdx * clamp01(session.slideIdx / 6);
  sum += weights.boredom * clamp(session.boredom, 0, 1.5);
  
  // Add noise
  sum += rFloat(-weights.noise, weights.noise);
  
  // Apply modifiers
  if (session.streakBreaker.active) {
    sum -= 0.60;
  }
  
  if (session.interestSpike) {
    sum -= 0.35;
  }
  
  // Pass through sigmoid
  return 1 / (1 + Math.exp(-sum));
}



// ============================================================================
// URL CHANGE DETECTION
// ============================================================================

async function waitForUrlChange(page, session, timeout = SC_CONFIG.urlChangeTimeout) {
  const startUrl = await page.url();
  const startTime = now();
  
  while (now() - startTime < timeout) {
    await sleep(rInt(SC_CONFIG.urlPollInterval[0], SC_CONFIG.urlPollInterval[1]));
    
    const currentUrl = await page.url();
    if (currentUrl !== startUrl) {
      return currentUrl;
    }
  }
  
  return null; // No change detected
}

// ============================================================================
// BETWEEN-ACCOUNT RECOVERY (BAR)
// ============================================================================

function computeBAR(session) {
  // Check eligibility
  if (session.scRemaining >= session.scStartMode * SC_CONFIG.barSoftCapMultiplier) {
    return 0; // Not eligible
  }
  
  if (session.barCount >= SC_CONFIG.barMaxPerSession) {
    return 0; // Max BARs used
  }
  
  if (session.slidesWatchedHere < 2 || session.scSpentHere < 2.0) {
    return 0; // Not enough engagement
  }
  
  // Compute base boost by mood
  let baseBoost;
  const moodName = session.getMoodName();
  switch (moodName) {
    case 'Morning':
      baseBoost = rFloat(0.6, 1.2);
      break;
    case 'Midday':
      baseBoost = rFloat(0.8, 1.6);
      break;
    case 'Evening':
      baseBoost = rFloat(1.0, 2.0);
      break;
    default:
      baseBoost = rFloat(0.8, 1.6);
  }
  
  // Apply decay
  baseBoost *= SC_CONFIG.barDecayFactors[session.barCount];
  
  // Apply performance bias
  if (session.scSpentHere >= 4.0 || session.slidesWatchedHere >= 5) {
    baseBoost *= 1.15;
  } else if (session.scSpentHere >= 2.0) {
    baseBoost *= 1.05;
  } else {
    baseBoost *= 0.90;
  }
  
  // Apply modulators
  if (session.fatigue >= 0.9) {
    baseBoost *= 0.75;
  }
  if (session.scRemaining <= 3.0) {
    baseBoost *= 1.20;
  }
  
  // Apply caps
  baseBoost = Math.min(baseBoost, SC_CONFIG.barPerHopCap);
  const hardCap = session.scStartMode * SC_CONFIG.barHardCapMultiplier;
  baseBoost = Math.min(baseBoost, hardCap - session.scRemaining);
  
  // Social recharge (once per session)
  if (!session.socialRechargeUsed && 
      session.fatigue <= 0.8 && 
      session.slidesWatchedHere >= 4 &&
      Math.random() < SC_CONFIG.socialRechargeChance) {
    const recharge = rFloat(SC_CONFIG.socialRechargeBoost[0], SC_CONFIG.socialRechargeBoost[1]);
    baseBoost += recharge;
    session.socialRechargeUsed = true;
    session.log(`[BAR] Social recharge: +${recharge.toFixed(2)} SC`);
  }
  
  return Math.max(0, baseBoost);
}

// ============================================================================
// SMART NAVIGATION SYSTEM
// ============================================================================

async function smartNavigateToNextSlide(page, session) {
  const maxTimePerSlide = 18000; // 18 seconds max per slide
  const startTime = now();
  let attemptCount = 0;
  const maxAttempts = 4;
  
  session.log(`[SmartNav] Starting intelligent navigation to next slide`);
  
  while (attemptCount < maxAttempts && (now() - startTime) < maxTimePerSlide) {
    attemptCount++;
    
    // Human-like variation in retry behavior
    if (attemptCount > 1) {
      const thinkingPause = rInt(800, 2000); // Human thinking pause
      session.log(`[SmartNav] Attempt ${attemptCount}/${maxAttempts} - thinking for ${thinkingPause}ms`);
      await sleep(thinkingPause);
    }
    
    // Try navigation with human-like variations
    const navigationSuccess = await attemptHumanLikeNavigation(page, session, attemptCount);
    
    if (navigationSuccess.success) {
      session.log(`[SmartNav] ✅ Success on attempt ${attemptCount} via ${navigationSuccess.method}`);
      return { success: true, newUrl: navigationSuccess.newUrl, method: navigationSuccess.method };
    }
    
    // Log the failure naturally
    if (attemptCount < maxAttempts) {
      session.log(`[SmartNav] ⚠️ Attempt ${attemptCount} failed, will retry naturally`);
    }
  }
  
  // All attempts failed - time to move on gracefully
  if (attemptCount >= maxAttempts) {
    session.log(`[SmartNav] ❌ ${maxAttempts} attempts exhausted, moving on naturally`);
  } else {
    session.log(`[SmartNav] ⏰ Time limit reached (${maxTimePerSlide}ms), moving on naturally`);
  }
  
  return { success: false, reason: 'navigation_exhausted' };
}

async function attemptHumanLikeNavigation(page, session, attemptNumber) {
  try {
    // Get viewport dimensions
    const vpDims = await page.evaluate(() => ({ w: innerWidth || 360, h: innerHeight || 640 }));
    
    // Analyze current story content to find problematic elements
    const storyElement = await page.$('div[role="main"]') || await page.$('main') || await page.$('body');
    let safeZones = null;
    
    if (storyElement) {
      const contentAnalysis = await analyzeStoryContent(storyElement);
      if (contentAnalysis.hasProblematicContent) {
        // Convert viewport format from {w, h} to {width, height}
        const viewport = { width: vpDims.w, height: vpDims.h };
        safeZones = getSafeTapZones(contentAnalysis.problematicElements, viewport);
        session.log(`[SmartNav] Content analysis: ${contentAnalysis.totalElements} problematic elements detected`);
        session.log(`[SmartNav] Safe zones: ${safeZones.totalZones} zones available`);
        
        // Log safe zone details for debugging
        if (safeZones.zones && safeZones.zones.length > 0) {
          const bestZone = safeZones.zones[0];
          session.log(`[SmartNav] Best safe zone: ${bestZone.name} at (${Math.round(bestZone.x1)},${Math.round(bestZone.y1)},${Math.round(bestZone.x2)},${Math.round(bestZone.y2)})`);
        }
        
        // Log problematic elements for debugging (limit to first 5 to avoid spam)
        const elementsToLog = contentAnalysis.problematicElements.slice(0, 5);
        elementsToLog.forEach((element, index) => {
          session.log(`[SmartNav] Avoiding ${element.type} at (${Math.round(element.x1)},${Math.round(element.y1)},${Math.round(element.x2)},${Math.round(element.y2)})`);
        });
        if (contentAnalysis.problematicElements.length > 5) {
          session.log(`[SmartNav] ... and ${contentAnalysis.problematicElements.length - 5} more elements`);
        }
      } else {
        session.log(`[SmartNav] No problematic content detected, using default zones`);
      }
    }
    
    // Create truly randomized tap positions for each attempt using safe zones
    const tapPosition = generateRandomizedTapPosition(vpDims, attemptNumber, session, safeZones);
    
    session.log(`[SmartNav] Tap attempt ${attemptNumber}: (${tapPosition.x}, ${tapPosition.y}) with ${tapPosition.delay}ms delay`);
    
    // Execute the tap with human-like timing
    const tapSuccess = await executeHumanLikeTap(page, tapPosition.x, tapPosition.y, tapPosition.delay);
    
    if (!tapSuccess) {
      return { success: false, reason: 'tap_failed' };
    }
    
    // Wait for URL change with human-like patience
    const urlChangeResult = await waitForUrlChangeWithPatience(page, session, attemptNumber);
    
    if (urlChangeResult.success) {
      return { 
        success: true, 
        newUrl: urlChangeResult.newUrl, 
        method: `tap_${attemptNumber}_${urlChangeResult.waitTime}ms` 
      };
    }
    
    return { success: false, reason: 'no_url_change' };
    
  } catch (error) {
    session.log(`[SmartNav] Error in attempt ${attemptNumber}: ${error.message}`);
    return { success: false, reason: 'error', error: error.message };
  }
}

/**
 * Advanced Human-Like Tap System - Category-based sampling with session persistence
 * Implements Base (≈70%), Wide (≈20%), Rare (≈10%) distribution with hazard tracking
 */
function generateRandomizedTapPosition(viewport, attemptNumber, session, safeZones = null) {
  // Check feature flag for advanced tap system
  if (!FEATURE_FLAGS.useAdvancedRightTap) {
    // Fallback to simple randomized positioning
    return generateSimpleRandomizedTapPosition(viewport, attemptNumber, session, safeZones);
  }
  
  const config = SC_CONFIG.rightTap;
  const profile = session.rightTapProfile;
  
  // Use safe zones if provided, otherwise use default ROI
  let roi = config.roi;
  if (safeZones && safeZones.zones && safeZones.zones.length > 0) {
    // Use the highest priority safe zone
    const bestZone = safeZones.zones[0];
    roi = {
      x: [Math.max(0, bestZone.x1 / viewport.w), Math.min(1, bestZone.x2 / viewport.w)],
      y: [Math.max(0, bestZone.y1 / viewport.h), Math.min(1, bestZone.y2 / viewport.h)]
    };
    
    // Debug logging
    console.log(`[Debug] Safe zone: (${bestZone.x1},${bestZone.y1},${bestZone.x2},${bestZone.y2})`);
    console.log(`[Debug] Viewport: ${viewport.w}x${viewport.h}`);
    console.log(`[Debug] ROI: x[${roi.x[0].toFixed(3)},${roi.x[1].toFixed(3)}], y[${roi.y[0].toFixed(3)},${roi.y[1].toFixed(3)}]`);
    
    // Ensure valid ROI bounds
    if (isNaN(roi.x[0]) || isNaN(roi.x[1]) || isNaN(roi.y[0]) || isNaN(roi.y[1]) ||
        roi.x[0] >= roi.x[1] || roi.y[0] >= roi.y[1]) {
      console.log(`[Debug] Invalid ROI bounds (NaN or invalid), falling back to default`);
      // Fallback to default ROI if safe zone is invalid
      roi = config.roi;
    }
  }
  
  // Step A: Choose category (Base/Wide/Rare) with hazard adjustments
  let adjustedWeights = { ...profile.weights };
  
  // Apply hazard boosts if thresholds not met
  if (profile.tapsSinceWide >= config.hazards.wideThreshold) {
    adjustedWeights.wide += config.hazards.wideBoost;
    adjustedWeights.base -= config.hazards.wideBoost * 0.7;  // Reduce base proportionally
    adjustedWeights.rare -= config.hazards.wideBoost * 0.3;  // Reduce rare proportionally
  }
  if (profile.tapsSinceRare >= config.hazards.rareThreshold) {
    adjustedWeights.rare += config.hazards.rareBoost;
    adjustedWeights.base -= config.hazards.rareBoost * 0.8;  // Reduce base proportionally
    adjustedWeights.wide -= config.hazards.rareBoost * 0.2;  // Reduce wide proportionally
  }
  
  // Renormalize weights
  const totalWeight = adjustedWeights.base + adjustedWeights.wide + adjustedWeights.rare;
  adjustedWeights.base /= totalWeight;
  adjustedWeights.wide /= totalWeight;
  adjustedWeights.rare /= totalWeight;
  
  // Sample category
  const roll = Math.random();
  let category, cumulative = 0;
  for (const [cat, weight] of Object.entries(adjustedWeights)) {
    cumulative += weight;
    if (roll <= cumulative) {
      category = cat;
      break;
    }
  }
  
  // Step B: Sample coordinates by category
  let x, y;
  let attempts = 0;
  const maxAttempts = config.antiRobot.resampleAttempts;
  
  do {
    attempts++;
    
    if (category === 'base') {
      // BASE: dominant cluster around session anchor
      let peakIdx;
      
      // Stickiness: reuse same peak with probability s
      if (profile.lastPeakIdx !== null && Math.random() < profile.stickiness) {
        peakIdx = profile.lastPeakIdx;
  } else {
        // Sample by peak weights
  const roll = Math.random();
        let cumulative = 0;
        for (let i = 0; i < profile.peakWeights.length; i++) {
          cumulative += profile.peakWeights[i];
          if (roll <= cumulative) {
            peakIdx = i;
            break;
          }
        }
      }
      
      // Get coordinates from chosen peak
      const peak = profile.microPeaks[peakIdx];
      const peakX = profile.anchor.x * viewport.w + peak.deltaX;
      const peakY = profile.anchor.y * viewport.h + peak.deltaY;
      
      // Sample discrete offsets per axis
      const offsetX = sampleDiscreteOffset(profile.offsetDist);
      const offsetY = sampleDiscreteOffset(profile.offsetDist);
      
      // Add small continuous jitter
      const jitterX = rFloat(-2, 2);
      const jitterY = rFloat(-2, 2);
      
      x = peakX + offsetX + jitterX;
      y = peakY + offsetY + jitterY;
      
      // Store peak index for stickiness
      profile.lastPeakIdx = peakIdx;
      
    } else if (category === 'wide') {
      // WIDE: broader right-side zone (elliptical Gaussian)
      const sigmaX = config.wideZone.sigmaX * viewport.w;
      const sigmaY = config.wideZone.sigmaY * viewport.h;
      
      // Sample from truncated elliptical Gaussian
      do {
        const u1 = Math.random();
        const u2 = Math.random();
        
        // Box-Muller transform
        const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        const z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
        
        x = profile.anchor.x * viewport.w + z0 * sigmaX;
        y = profile.anchor.y * viewport.h + z1 * sigmaY;
      } while (!isInSafeZone(x, y, viewport, config, roi));
      
    } else { // category === 'rare'
      // RARE: farther, unexpected but plausible
      const rareZone = chooseRareZone(config.rareZones, profile.anchor, viewport);
      
      if (rareZone === 'edgeNear') {
        x = sampleNormal(config.rareZones.edgeNear.x.mean * viewport.w, 
                        config.rareZones.edgeNear.x.std * viewport.w, 
                        roi.x[0] * viewport.w, 
                        roi.x[1] * viewport.w);
        y = rFloat(config.rareZones.edgeNear.y.min * viewport.h, 
                   config.rareZones.edgeNear.y.max * viewport.h);
      } else if (rareZone === 'innerRight') {
        x = sampleNormal(config.rareZones.innerRight.x.mean * viewport.w, 
                        config.rareZones.innerRight.x.std * viewport.w, 
                        roi.x[0] * viewport.w, 
                        roi.x[1] * viewport.w);
        y = sampleNormal(profile.anchor.y * viewport.h, 
                        config.rareZones.innerRight.y.std * viewport.h, 
                        roi.y[0] * viewport.h, 
                        roi.y[1] * viewport.h);
      } else { // highLow
        const sign = Math.random() < 0.5 ? 1 : -1;
        x = sampleNormal(profile.anchor.x * viewport.w, 
                        config.rareZones.highLow.x.std * viewport.w, 
                        roi.x[0] * viewport.w, 
                        roi.x[1] * viewport.w);
        y = sampleNormal(profile.anchor.y * viewport.h + sign * config.rareZones.highLow.y.offset * viewport.h, 
                        config.rareZones.highLow.y.std * viewport.h, 
                        roi.y[0] * viewport.h, 
                        roi.y[1] * viewport.h);
      }
    }
    
    // Clamp to ROI and safety zones
    x = clamp(x, roi.x[0] * viewport.w, roi.x[1] * viewport.w);
    y = clamp(y, roi.y[0] * viewport.h, roi.y[1] * viewport.h);
    
    // Safety check: never violate exclusion bands
    if (y < config.safety.top * viewport.h || 
        y > config.safety.bottom * viewport.h || 
        x > config.safety.right * viewport.w) {
      // Snap to safe anchor inside ROI
      x = profile.anchor.x * viewport.w;
      y = profile.anchor.y * viewport.h;
      break;
    }
    
  } while (attempts < maxAttempts && !isInSafeZone(x, y, viewport, config, roi));
  
  // Step C: Anti-robot adjustments
  if (profile.lastTap && Math.random() < profile.minDistanceProb) {
    const lastTap = profile.lastTap;
    const distance = Math.sqrt((x - lastTap.x) ** 2 + (y - lastTap.y) ** 2);
    
    if (distance < profile.minDistance) {
      // Push away along vector by (minDist - d + 1) px
      const vectorX = x - lastTap.x;
      const vectorY = y - lastTap.y;
      const vectorLength = Math.sqrt(vectorX ** 2 + vectorY ** 2);
      
      if (vectorLength > 0) {
        const pushDistance = profile.minDistance - distance + 1;
        x += (vectorX / vectorLength) * pushDistance;
        y += (vectorY / vectorLength) * pushDistance;
        
        // Re-clamp to safety
        x = clamp(x, roi.x[0] * viewport.w, roi.x[1] * viewport.w);
        y = clamp(y, roi.y[0] * viewport.h, roi.y[1] * viewport.h);
      }
    }
  }
  
  // Step D: Calculate delay
  let delay;
  if (Math.random() < profile.lookPauseChance) {
    // Look pause: longer delay
    delay = rFloat(config.timing.lookPause.duration.min, config.timing.lookPause.duration.max);
  } else {
    // Normal delay with multipliers
    const baseDelay = rFloat(profile.baseDelayRange.min, profile.baseDelayRange.max);
    const attemptMultiplier = 1 + profile.attemptMultiplier * (attemptNumber - 1);
    const fatigueMultiplier = 1 + profile.fatigueMultiplier * session.fatigue;
    delay = baseDelay * attemptMultiplier * fatigueMultiplier;
  }
  
  // Update session state
  profile.lastTap = { x: Math.round(x), y: Math.round(y) };
  
  // Update hazard counters
  if (category === 'wide') {
    profile.tapsSinceWide = 0;
  } else {
    profile.tapsSinceWide++;
  }
  
  if (category === 'rare') {
    profile.tapsSinceRare = 0;
  } else {
    profile.tapsSinceRare++;
  }
  
  // Store for legacy compatibility
  session.lastTapX = Math.round(x);
  session.lastTapY = Math.round(y);
  
  return {
    x: Math.round(x),
    y: Math.round(y),
    delay: Math.round(delay),
    zone: 'right_navigation',
    category: category,
    attempts: attempts
  };
}

/**
 * Global statistical sampling functions
 */
function sampleNormal(mean, std, min, max) {
  // Box-Muller transform for normal distribution
  let u1, u2;
  do {
    u1 = Math.random();
    u2 = Math.random();
  } while (u1 === 0);
  
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  const value = mean + z0 * std;
  
  return clamp(value, min, max);
}

/**
 * Helper function to sample discrete pixel offsets
 */
function sampleDiscreteOffset(offsetDist) {
  const roll = Math.random();
  if (roll < offsetDist.dominantProb) {
    return 0; // Dominant (no offset)
  }
  
  // Sample from {±1, ±2, ±3, ±4} px
  const remainingRoll = (roll - offsetDist.dominantProb) / (1 - offsetDist.dominantProb);
  let cumulative = 0;
  
  for (let i = 0; i < offsetDist.pixelOffsets.length; i++) {
    cumulative += offsetDist.weights[i];
    if (remainingRoll <= cumulative) {
      const sign = Math.random() < 0.5 ? 1 : -1;
      return sign * offsetDist.pixelOffsets[i];
    }
  }
  
  return 0; // Fallback
}

/**
 * Helper function to choose a rare zone
 */
function chooseRareZone(rareZones, anchor, viewport) {
  const zones = ['edgeNear', 'innerRight', 'highLow'];
  const weights = [0.4, 0.35, 0.25]; // Slightly favor edge-near
  
  const roll = Math.random();
  let cumulative = 0;
  for (let i = 0; i < zones.length; i++) {
    cumulative += weights[i];
    if (roll <= cumulative) {
      return zones[i];
    }
  }
  return 'edgeNear'; // Fallback
}

/**
 * Helper function to check if coordinates are in safe zone
 */
function isInSafeZone(x, y, viewport, config, roi = null) {
  const effectiveRoi = roi || config.roi;
  return x >= effectiveRoi.x[0] * viewport.w &&
         x <= effectiveRoi.x[1] * viewport.w &&
         y >= effectiveRoi.y[0] * viewport.h &&
         y <= effectiveRoi.y[1] * viewport.h &&
         y >= config.safety.top * viewport.h &&
         y <= config.safety.bottom * viewport.h &&
         x <= config.safety.right * viewport.w;
}

/**
 * Fallback simple randomized tap positioning (when advanced system is disabled)
 */
function generateSimpleRandomizedTapPosition(viewport, attemptNumber, session, safeZones = null) {
  // Use safe zones if provided, otherwise fallback to simple right-side zone
  let rightZone;
  if (safeZones && safeZones.zones && safeZones.zones.length > 0) {
    // Use the highest priority safe zone
    const bestZone = safeZones.zones[0];
    rightZone = {
      xMin: Math.max(0, bestZone.x1 / viewport.w),
      xMax: Math.min(1, bestZone.x2 / viewport.w),
      yMin: Math.max(0, bestZone.y1 / viewport.h),
      yMax: Math.min(1, bestZone.y2 / viewport.h)
    };
    
    // Ensure valid zone bounds
    if (isNaN(rightZone.xMin) || isNaN(rightZone.xMax) || isNaN(rightZone.yMin) || isNaN(rightZone.yMax) ||
        rightZone.xMin >= rightZone.xMax || rightZone.yMin >= rightZone.yMax) {
      // Fallback to default zone if safe zone is invalid
      rightZone = {
        xMin: 0.70, xMax: 0.90,
        yMin: 0.30, yMax: 0.70
      };
    }
  } else {
    // Simple right-side zone with natural variation
    rightZone = {
      xMin: 0.70, xMax: 0.90,
      yMin: 0.30, yMax: 0.70
    };
  }
  
  // Generate base position with natural variation
  let baseX = rFloat(rightZone.xMin, rightZone.xMax);
  let baseY = rFloat(rightZone.yMin, rightZone.yMax);
  
  // Add micro-variation for human imprecision
  const microOffset = rInt(5, 20);
  const finalX = Math.max(1, Math.min(viewport.w - 2, 
    Math.round(viewport.w * baseX + rInt(-microOffset, microOffset))));
  const finalY = Math.max(1, Math.min(viewport.h - 2, 
    Math.round(viewport.h * baseY + rInt(-microOffset, microOffset))));
  
  // Natural delay variation
  const baseDelay = rInt(100, 200);
  const attemptMultiplier = 1 + (attemptNumber - 1) * 0.3;
  const finalDelay = Math.round(baseDelay * attemptMultiplier);
  
  // Store for drift calculation
  session.lastTapX = finalX;
  session.lastTapY = finalY;
  
  return {
    x: finalX,
    y: finalY,
    delay: finalDelay,
    zone: 'right_navigation_simple',
    category: 'fallback'
  };
}

async function executeHumanLikeTap(page, x, y, delayMs) {
  try {
  const cdp = await page.target().createCDPSession();
    
    // Enhanced human-like touch parameters with natural variation
    const force = rFloat(0.35, 0.75); // Wider force range for natural variation
    const radius = rInt(2, 8); // More varied touch radius
    
    // Add natural touch pressure variation
    const pressureVariation = rFloat(0.8, 1.2);
    const adjustedForce = clamp(force * pressureVariation, 0.2, 0.9);
    
    // Natural touch timing variation
    const touchStartDelay = rInt(10, 40); // Small delay before touch
    const touchEndDelay = rInt(15, 35);   // Small delay after touch
    
    // Execute touch with natural timing
    await sleep(touchStartDelay);
    
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ 
        x: Math.round(x), 
        y: Math.round(y), 
        id: 1, 
        force: adjustedForce, 
        radiusX: radius, 
        radiusY: radius 
      }],
    });
    
    // Main delay with micro-variation
    const mainDelay = delayMs + rInt(-20, 30); // ±20-30ms natural variation
    await sleep(mainDelay);
    
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    
    await sleep(touchEndDelay);
    await cdp.detach();
    
    return true;
  } catch (error) {
    return false;
  }
}

async function waitForUrlChangeWithPatience(page, session, attemptNumber) {
  const startUrl = await page.url();
  const startTime = now();
  
  // Progressive patience: earlier attempts wait less, later attempts wait more
  const patienceMultiplier = 1 + (attemptNumber * 0.3); // 1.0x, 1.3x, 1.6x, 1.9x
  const maxWaitTime = Math.min(3000 * patienceMultiplier, 8000); // Cap at 8 seconds
  
  while (now() - startTime < maxWaitTime) {
    // Human-like polling intervals
    const pollInterval = rInt(100, 200) * patienceMultiplier;
    await sleep(pollInterval);
    
    const currentUrl = await page.url();
    if (currentUrl !== startUrl) {
      const waitTime = now() - startTime;
      session.log(`[SmartNav] URL changed after ${waitTime}ms (attempt ${attemptNumber})`);
      return { success: true, newUrl: currentUrl, waitTime };
    }
  }
  
  return { success: false, waitTime: maxWaitTime };
}

// ============================================================================
// TOUCH INTERACTIONS
// ============================================================================

async function touchTapAt(page, x, y, opts = {}) {
  const { force = 0.55, radius = 4, delayMs = 90 } = opts;
  try {
    const vpDims = await page.evaluate(() => ({ w: innerWidth || 360, h: innerHeight || 640 }));
    const cx = Math.max(1, Math.min(vpDims.w - 2, Math.round(x)));
    const cy = Math.max(1, Math.min(vpDims.h - 2, Math.round(y)));
    
    // Add natural micro-variation to the exact coordinates for human-like imprecision
    const microOffsetX = rInt(-3, 3);
    const microOffsetY = rInt(-3, 3);
    const finalX = Math.max(1, Math.min(vpDims.w - 2, cx + microOffsetX));
    const finalY = Math.max(1, Math.min(vpDims.h - 2, cy + microOffsetY));
    
    const cdp = await page.target().createCDPSession();
    
    // Enhanced human-like touch parameters
    const adjustedForce = force * rFloat(0.9, 1.1); // ±10% force variation
    const adjustedRadius = radius + rInt(-1, 1); // ±1px radius variation
    
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: finalX, y: finalY, id: 1, force: adjustedForce, radiusX: adjustedRadius, radiusY: adjustedRadius }],
    });
    
    // Natural delay variation
    const adjustedDelay = delayMs + rInt(-15, 20); // ±15-20ms delay variation
    await sleep(adjustedDelay);
    
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    try { await cdp.detach(); } catch { }
    return true;
  } catch { return false; }
}

async function storyTapNext(page, session) {
  const vpDims = await page.evaluate(() => ({ w: innerWidth || 360, h: innerHeight || 640 }));
  
  // Use the same randomized positioning system for consistency
  const tapPosition = generateRandomizedTapPosition(vpDims, 1, session);
  
  session.log(`[Continue] 👉 Tapped right side for next slide (${tapPosition.x}, ${tapPosition.y})`);
  
  try {
    const cdp = await page.target().createCDPSession();
    
    // Enhanced human-like touch parameters with natural variation
    const force = rFloat(0.35, 0.75); // Wider force range
    const radius = rInt(2, 8); // More varied touch radius
    
    // Add natural touch pressure variation
    const pressureVariation = rFloat(0.8, 1.2);
    const adjustedForce = clamp(force * pressureVariation, 0.2, 0.9);
      
      await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ 
        x: tapPosition.x, 
        y: tapPosition.y, 
        id: 1, 
        force: adjustedForce, 
        radiusX: radius, 
        radiusY: radius 
      }],
    });
    
    // Natural delay variation
    const delay = rInt(80, 150) + rInt(-15, 25); // Base delay ± variation
    await sleep(delay);
    
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    
    return true;
  } catch (error) {
    session.log(`[Continue] ❌ Tap failed: ${error.message}`);
    return false;
  }
}

// ============================================================================
// STORY NAVIGATION
// ============================================================================

async function navigateToStories(page, session, visitedProfiles = new Set()) {
  try {
    session.log(`[Stories] Attempting to navigate to stories...`);
    
    const storiesSelectors = [
      'div[role="button"]:has(circle[stroke*="url"])',
      'div[role="button"]:has(circle[stroke*="gradient"])',
      'div[role="button"]:has(circle[stroke*="#"])',
      'div[role="button"]:has(circle[stroke-width])',
      'div[role="button"]:has(img[alt*="profile" i])',
    ];
    
    for (const selector of storiesSelectors) {
      try {
        const storyElements = await page.$$(selector);
        session.log(`[Stories] Found ${storyElements.length} elements with selector: ${selector}`);
        
        if (storyElements.length > 0) {
          // Find unread stories first
          let storyButton = null;
          
          for (let j = 0; j < storyElements.length; j++) {
            const element = storyElements[j];
            const hasUnreadIndicator = await element.evaluate(el => {
              const hasColoredBorder = el.querySelector('circle[stroke*="url"], circle[stroke*="gradient"], circle[stroke*="#"]');
              const hasUnreadDot = el.querySelector('div[data-testid="story-ring"]');
              const hasUnreadClass = el.className.includes('unread') || el.className.includes('new');
              return hasColoredBorder || hasUnreadDot || hasUnreadClass;
            });
            
            if (hasUnreadIndicator) {
              storyButton = element;
              session.log(`[Stories] Found unread story at index ${j}`);
              break;
            }
          }
          
          // If no unread stories, try any non-"Your story" (prioritize unviewed)
          if (!storyButton) {
                         // First, try to find unviewed stories
             let unviewedStories = [];
             for (let j = 0; j < storyElements.length; j++) {
               const element = storyElements[j];
               const storyInfo = await element.evaluate(el => {
                 const isYourStory = el.querySelector('img[alt*="profile" i]') && 
                                   (el.textContent.includes('Your story') || 
                                    el.getAttribute('aria-label')?.includes('Your story') ||
                                    el.querySelector('div[data-testid="add-to-story"]'));
                 
                 // Check if story is viewed/expired using multiple methods
                 const hasGrayBorder = el.querySelector('circle[stroke="#dbdbdb"], circle[stroke="#8e8e96"]');
                 const hasGradientBorder = el.querySelector('circle[stroke*="url"], circle[stroke*="gradient"]');
                 const hasNoBorder = !el.querySelector('circle[stroke]');
                 
                 // Try CSS-based detection
                 const hasGradientClass = el.className.includes('gradient') || el.className.includes('unread') || el.className.includes('new');
                 const hasViewedClass = el.className.includes('viewed') || el.className.includes('seen') || el.className.includes('expired');
                 
                 // Check for data attributes
                 const hasUnreadData = el.getAttribute('data-unread') === 'true' || el.getAttribute('data-viewed') === 'false';
                 const hasViewedData = el.getAttribute('data-viewed') === 'true' || el.getAttribute('data-seen') === 'true';
                 
                 // Check aria-label for status
                 const ariaLabel = el.getAttribute('aria-label') || '';
                 const hasUnreadAria = ariaLabel.includes('not seen') || ariaLabel.includes('unread') || ariaLabel.includes('new');
                 const hasViewedAria = ariaLabel.includes('seen') || ariaLabel.includes('viewed') || ariaLabel.includes('expired');
                 
                 const isViewed = hasGrayBorder || hasNoBorder || hasViewedClass || hasViewedData || hasViewedAria;
                 const isUnviewed = hasGradientBorder || hasGradientClass || hasUnreadData || hasUnreadAria;
                 
                 return {
                   isYourStory,
                   isViewed,
                   isUnviewed,
                   hasGrayBorder: !!hasGrayBorder,
                   hasGradientBorder: !!hasGradientBorder,
                   hasNoBorder: !!hasNoBorder,
                   ariaLabel: el.getAttribute('aria-label') || 'none',
                   textContent: el.textContent?.substring(0, 50) || 'none',
                   debug: {
                     grayBorder: !!hasGrayBorder,
                     gradientBorder: !!hasGradientBorder,
                     noBorder: !!hasNoBorder,
                     circleElements: el.querySelectorAll('circle').length,
                     allElements: el.querySelectorAll('*').length,
                     svgElements: el.querySelectorAll('svg').length,
                     pathElements: el.querySelectorAll('path').length,
                     strokeElements: el.querySelectorAll('[stroke]').length,
                     divElements: el.querySelectorAll('div').length,
                     className: el.className || 'none',
                     style: el.style.background || 'none'
                   }
                 };
               });
               
               if (!storyInfo.isYourStory && storyInfo.isUnviewed) {
                 // Analyze content to get bounding boxes of problematic elements
                 const contentAnalysis = await analyzeStoryContent(element);
                 
                 unviewedStories.push({ element, storyInfo, index: j, contentAnalysis });
                 
                 if (contentAnalysis.hasProblematicContent) {
                   session.log(`[Stories] Found unviewed story at index ${j} with ${contentAnalysis.totalElements} problematic elements (aria: "${storyInfo.ariaLabel}")`);
                 } else {
                   session.log(`[Stories] Found clean unviewed story at index ${j} (aria: "${storyInfo.ariaLabel}")`);
                 }
               }
             }
             
             session.log(`[Stories] Total unviewed stories found: ${unviewedStories.length}`);
             
             // For now, let's try any available story to get the system working
             session.log(`[Stories] Found ${storyElements.length} total stories, will try any available...`);
            
                         // If no unviewed stories found, try any non-"Your story"
             if (!storyButton) {
               session.log(`[Stories] No unviewed stories found, trying any available story...`);
               for (let j = 0; j < storyElements.length; j++) {
                 const element = storyElements[j];
                 const storyInfo = await element.evaluate(el => {
                   const isYourStory = el.querySelector('img[alt*="profile" i]') && 
                                     (el.textContent.includes('Your story') || 
                                      el.getAttribute('aria-label')?.includes('Your story') ||
                                      el.querySelector('div[data-testid="add-to-story"]'));
                   
                   // Check if story is viewed/expired using multiple methods
                   const hasGrayBorder = el.querySelector('circle[stroke="#dbdbdb"], circle[stroke="#8e8e96"]');
                   const hasGradientBorder = el.querySelector('circle[stroke*="url"], circle[stroke*="gradient"]');
                   const hasNoBorder = !el.querySelector('circle[stroke]');
                   
                   // Try CSS-based detection
                   const hasGradientClass = el.className.includes('gradient') || el.className.includes('unread') || el.className.includes('new');
                   const hasViewedClass = el.className.includes('viewed') || el.className.includes('seen') || el.className.includes('expired');
                   
                   // Check for data attributes
                   const hasUnreadData = el.getAttribute('data-unread') === 'true' || el.getAttribute('data-viewed') === 'false';
                   const hasViewedData = el.getAttribute('data-viewed') === 'true' || el.getAttribute('data-seen') === 'true';
                   
                   // Check aria-label for status
                   const ariaLabel = el.getAttribute('aria-label') || '';
                   const hasUnreadAria = ariaLabel.includes('not seen') || ariaLabel.includes('unread') || ariaLabel.includes('new');
                   const hasViewedAria = ariaLabel.includes('seen') || ariaLabel.includes('viewed') || ariaLabel.includes('expired');
                   
                   const isViewed = hasGrayBorder || hasNoBorder || hasViewedClass || hasViewedData || hasViewedAria;
                   const isUnviewed = hasGradientBorder || hasGradientClass || hasUnreadData || hasUnreadAria;
                   
                   return {
                     isYourStory,
                     isViewed,
                     isUnviewed,
                     hasGrayBorder: !!hasGrayBorder,
                     hasGradientBorder: !!hasGradientBorder,
                     hasNoBorder: !!hasNoBorder,
                     ariaLabel: el.getAttribute('aria-label') || 'none',
                     textContent: el.textContent?.substring(0, 50) || 'none',
                     debug: {
                       grayBorder: !!hasGrayBorder,
                       gradientBorder: !!hasGradientBorder,
                       noBorder: !!hasNoBorder,
                       circleElements: el.querySelectorAll('circle').length,
                       allElements: el.querySelectorAll('*').length,
                       svgElements: el.querySelectorAll('svg').length,
                       pathElements: el.querySelectorAll('path').length,
                       strokeElements: el.querySelectorAll('[stroke]').length,
                       divElements: el.querySelectorAll('div').length,
                       className: el.className || 'none',
                       style: el.style.background || 'none'
                     }
                   };
                 });
                 
                 if (!storyInfo.isYourStory) {
                   // Extract username from aria-label to avoid re-opening same profile
                   const ariaLabel = storyInfo.ariaLabel;
                   const usernameMatch = ariaLabel.match(/Story by ([^,]+)/);
                   const username = usernameMatch ? usernameMatch[1] : `profile_${j}`;
                   
                   // Skip if we've already visited this profile
                   if (visitedProfiles.has(username)) {
                     session.log(`[Stories] Skipping already visited profile: ${username}`);
                     continue;
                   }
                   
                   // Analyze content to get bounding boxes of problematic elements
                   const contentAnalysis = await analyzeStoryContent(element);
                   
                   storyButton = element;
                   if (contentAnalysis.hasProblematicContent) {
                     session.log(`[Stories] Using story at index ${j} with ${contentAnalysis.totalElements} problematic elements (viewed: ${storyInfo.isViewed}, unviewed: ${storyInfo.isUnviewed}, aria: "${storyInfo.ariaLabel}")`);
                   } else {
                     session.log(`[Stories] Using clean story at index ${j} (viewed: ${storyInfo.isViewed}, unviewed: ${storyInfo.isUnviewed}, aria: "${storyInfo.ariaLabel}")`);
                   }
                   break;
                 }
               }
             }
          }
          
                     // Simple story selection: just use any available story (avoiding visited profiles)
           if (!storyButton && storyElements.length > 0) {
             // Find first non-visited profile
             for (let j = 0; j < storyElements.length; j++) {
               const element = storyElements[j];
               const storyInfo = await element.evaluate(el => {
                 const isYourStory = el.querySelector('img[alt*="profile" i]') && 
                                   (el.textContent.includes('Your story') || 
                                    el.getAttribute('aria-label')?.includes('Your story') ||
                                    el.querySelector('div[data-testid="add-to-story"]'));
                 const ariaLabel = el.getAttribute('aria-label') || '';
                 return { isYourStory, ariaLabel };
               });
               
               if (!storyInfo.isYourStory) {
                 const usernameMatch = storyInfo.ariaLabel.match(/Story by ([^,]+)/);
                 const username = usernameMatch ? usernameMatch[1] : `profile_${j}`;
                 
                 if (!visitedProfiles.has(username)) {
                   // Analyze content to get bounding boxes of problematic elements
                   const contentAnalysis = await analyzeStoryContent(element);
                   
                   storyButton = element;
                   if (contentAnalysis.hasProblematicContent) {
                     session.log(`[Stories] Using first available non-visited story: ${username} (${contentAnalysis.totalElements} problematic elements)`);
                   } else {
                     session.log(`[Stories] Using first available clean non-visited story: ${username}`);
                   }
                   break;
                 }
               }
             }
             
             if (!storyButton) {
               session.log(`[Stories] All available profiles have been visited`);
             }
           }
          
                     if (storyButton) {
             session.log(`[Stories] Attempting to click story element...`);
             
             // Try multiple click methods
             let clickSuccess = false;
             
             // Method 1: Touch tap
             try {
               clickSuccess = await touchTapHandle(page, storyButton);
               session.log(`[Stories] Touch tap result: ${clickSuccess ? 'success' : 'failed'}`);
  } catch (error) {
               session.log(`[Stories] Touch tap error: ${error.message}`);
             }
             
             // Method 2: Mobile click if touch failed
             if (!clickSuccess) {
               try {
                 const mobileClickSuccess = await mobileClick(page, storyButton, {
                   waitForVisible: false,
                   scrollIntoView: true,
                   useTouch: true,
                   addDelay: true
                 });
                 
                 if (mobileClickSuccess) {
                   clickSuccess = true;
                   session.log(`[Stories] Mobile click result: success`);
                 } else {
                   session.log(`[Stories] Mobile click result: failed`);
                 }
               } catch (error) {
                 session.log(`[Stories] Mobile click error: ${error.message}`);
               }
             }
             
             // Method 3: JavaScript click as last resort
             if (!clickSuccess) {
               try {
                 await storyButton.evaluate(el => el.click());
                 clickSuccess = true;
                 session.log(`[Stories] JS click result: success`);
               } catch (error) {
                 session.log(`[Stories] JS click error: ${error.message}`);
               }
             }
             
        await sleep(rInt(1000, 2000));
             session.log(`[Stories] Clicked story element with selector: ${selector}`);
             
             await sleep(2000);
             
             // Debug: Check current URL and page state
             const currentUrl = await page.url();
             const pageTitle = await page.title();
             session.log(`[Stories] After click - URL: ${currentUrl}, Title: ${pageTitle}`);
             
             const isInStoryView = await isStoryActive(page);
             session.log(`[Stories] Story view detection: ${isInStoryView}`);
             
                          if (isInStoryView) {
               session.log(`[Stories] Successfully entered story view`);
               
               // Extract username and add to visited profiles
               const ariaLabel = await storyButton.evaluate(el => el.getAttribute('aria-label') || '');
               const usernameMatch = ariaLabel.match(/Story by ([^,]+)/);
               if (usernameMatch) {
                 const username = usernameMatch[1];
                 visitedProfiles.add(username);
                 session.log(`[Stories] Added ${username} to visited profiles (total: ${visitedProfiles.size})`);
          }
          
            return true;
             } else {
               session.log(`[Stories] Failed to enter story view, will try next story`);
               // Try the next story element
               for (let j = 1; j < storyElements.length; j++) {
                 const element = storyElements[j];
                 const storyInfo = await element.evaluate(el => {
                   const isYourStory = el.querySelector('img[alt*="profile" i]') && 
                                     (el.textContent.includes('Your story') || 
                                      el.getAttribute('aria-label')?.includes('Your story') ||
                                      el.querySelector('div[data-testid="add-to-story"]'));
                   return { isYourStory };
                 });
                 
                 if (!storyInfo.isYourStory) {
                   storyButton = element;
                   session.log(`[Stories] Trying next story at index ${j}`);
                   break;
                 }
               }
               
               if (storyButton) {
                 continue; // Try this new story
               } else {
                 session.log(`[Stories] No more stories to try, moving to next selector`);
                 break; // Exit the story loop and try next selector
               }
             }
           }
          }
        } catch (error) {
        session.log(`[Stories] Selector failed: ${selector} - ${error.message}`);
      }
    }
    
    // Check if we're in "all caught up" state
    const isAllCaughtUp = await page.evaluate(() => {
      const caughtUpText = document.querySelector('div[role="main"]')?.textContent || '';
      return caughtUpText.includes("You're all caught up") || 
             caughtUpText.includes("You've seen all new posts") ||
             caughtUpText.includes("No new stories");
    });
    
    if (isAllCaughtUp) {
      session.log(`[Stories] 📭 No active stories available - Instagram shows "all caught up"`);
    return false;
    }
    
    // Check if all found stories are viewed/expired
    const allStoriesViewed = await page.evaluate(() => {
      const storyElements = document.querySelectorAll('div[role="button"]:has(img[alt*="profile" i])');
      if (storyElements.length === 0) return false;
      
      let viewedCount = 0;
      let unviewedCount = 0;
      for (const el of storyElements) {
        const hasGrayBorder = el.querySelector('circle[stroke="#dbdbdb"], circle[stroke="#8e8e96"]');
        const hasGradientBorder = el.querySelector('circle[stroke*="url"], circle[stroke*="gradient"]');
        const hasNoBorder = !el.querySelector('circle[stroke]');
        const isViewed = hasGrayBorder || hasNoBorder;
        const isUnviewed = hasGradientBorder;
        
        if (isViewed) viewedCount++;
        if (isUnviewed) unviewedCount++;
      }
      
      // Only consider all viewed if there are no unviewed stories
      return viewedCount > 0 && unviewedCount === 0;
    });
    
    if (allStoriesViewed) {
      session.log(`[Stories] 📭 All available stories are already viewed/expired`);
            return false;
          }
          
    session.log(`[Stories] No active story elements found`);
    return false;
  } catch (error) {
    session.log(`[Stories] Navigation error: ${error.message}`);
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
    session.log(`[Stories] Story detection error: ${error.message}`);
    return false;
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
// EXIT HANDLING
// ============================================================================

async function exitViaCloseButton(page, session) {
  try {
    // ⚠️ Swipe-left exit logic has been permanently removed per client requirements.
    // Do NOT reintroduce swipe gestures. Always use close button → Escape fallback.
    
    // Specific selectors for close button ONLY - avoiding menu and sound buttons
    const closeSelectors = [
      'svg[aria-label="Close"]',
      'button[aria-label="Close"]',
      'div[role="button"] svg[aria-label="Close"]',
      'div[role="button"]:has(svg[aria-label="Close"])',
      'button svg[aria-label="Close"]',
      'div[role="button"] svg[aria-label="X"]',
      'button[aria-label="X"]',
    ];
    
         let attempts = 0;
     const maxAttempts = 1; // Reduced from 2 to 1 - try each selector only once
     
     while (attempts < maxAttempts) {
       attempts++;
       
       // Try only the most reliable selectors first
       const prioritySelectors = [
         'svg[aria-label="Close"]',
         'button[aria-label="Close"]',
         'div[role="button"] svg[aria-label="Close"]',
       ];
       
       for (const selector of prioritySelectors) {
        try {
          session.log(`[Exit] Attempt ${attempts}/${maxAttempts} → Trying close button: ${selector}`);
          
                     // Wait for the specific close button to be visible (reduced timeout)
           await page.waitForSelector(selector, { timeout: 1000 });
          const closeButton = await page.$(selector);
          
          if (closeButton) {
                         // Strict verification - must be a close button, not menu or sound
             const buttonInfo = await closeButton.evaluate(el => {
               const ariaLabel = el.getAttribute('aria-label') || '';
               const parentAriaLabel = el.closest('[aria-label]')?.getAttribute('aria-label') || '';
               
               // Must have explicit close label
               const hasCloseLabel = ariaLabel.toLowerCase().includes('close') || 
                                   ariaLabel.toLowerCase().includes('x') ||
                                   parentAriaLabel.toLowerCase().includes('close') ||
                                   parentAriaLabel.toLowerCase().includes('x');
               
               // Must NOT be menu, sound, or more button
               const isNotMenu = !ariaLabel.toLowerCase().includes('menu') && 
                                !ariaLabel.toLowerCase().includes('sound') &&
                                !ariaLabel.toLowerCase().includes('volume') &&
                                !ariaLabel.toLowerCase().includes('more') &&
                                !parentAriaLabel.toLowerCase().includes('menu') &&
                                !parentAriaLabel.toLowerCase().includes('sound') &&
                                !parentAriaLabel.toLowerCase().includes('volume') &&
                                !parentAriaLabel.toLowerCase().includes('more');
               
               // Check for close-like icons (X, cross, etc.) but NOT circles (which could be menu)
               const hasCloseIcon = el.querySelector('path[d*="M"], line, polyline') !== null;
               const hasCircleIcon = el.querySelector('circle') !== null;
               
               // Check if it's in the top-right area (typical close button position)
               const rect = el.getBoundingClientRect();
               const isTopRight = rect.top < 100 && rect.right > window.innerWidth - 100;
               
               return {
                 hasCloseLabel,
                 hasCloseIcon,
                 hasCircleIcon,
                 isNotMenu,
                 isTopRight,
                 ariaLabel,
                 parentAriaLabel,
                 rect: { top: rect.top, right: rect.right, width: rect.width, height: rect.height }
               };
             });
             
             session.log(`[Exit] 🔍 Button analysis: close=${buttonInfo.hasCloseLabel}, icon=${buttonInfo.hasCloseIcon}, circle=${buttonInfo.hasCircleIcon}, notMenu=${buttonInfo.isNotMenu}, topRight=${buttonInfo.isTopRight}, aria="${buttonInfo.ariaLabel}"`);
             
             // Must have close label AND not be menu AND (close icon OR in top-right position)
             // Reject if it has circle icon (likely menu button)
             const isCloseButton = buttonInfo.hasCloseLabel && 
                                 buttonInfo.isNotMenu && 
                                 !buttonInfo.hasCircleIcon &&
                                 (buttonInfo.hasCloseIcon || buttonInfo.isTopRight);
            
            if (!isCloseButton) {
              session.log(`[Exit] ⚠️ Found element but not a close button: ${selector}`);
            continue;
            }
            
            // Enhanced visibility check - check if element is actually clickable
            const isVisible = await closeButton.isVisible();
            const isClickable = await closeButton.evaluate(el => {
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              
              // Check if element has size and is not hidden
              const hasSize = rect.width > 0 && rect.height > 0;
              const isNotHidden = style.display !== 'none' && 
                                style.visibility !== 'hidden' && 
                                style.opacity !== '0';
              
              // Check if element is not covered by other elements
              const elementAtPoint = document.elementFromPoint(
                rect.left + rect.width / 2, 
                rect.top + rect.height / 2
              );
              const isNotCovered = elementAtPoint === el || el.contains(elementAtPoint);
              
              return {
                hasSize,
                isNotHidden,
                isNotCovered,
                rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left }
              };
            });
            
            if (!isVisible || !isClickable.hasSize || !isClickable.isNotHidden) {
              session.log(`[Exit] ⚠️ Close button not clickable: visible=${isVisible}, size=${isClickable.hasSize}, hidden=${!isClickable.isNotHidden}, covered=${!isClickable.isNotCovered}`);
              continue;
            }
            
            // Click the parent button if it's an SVG
            let elementToClick = closeButton;
            if (selector.includes('svg[')) {
              const parentButton = await closeButton.evaluateHandle(el => {
                let parent = el.parentElement;
                while (parent) {
                  if (parent.tagName === 'BUTTON' || 
                      (parent.tagName === 'DIV' && parent.getAttribute('role') === 'button')) {
                    return parent;
                  }
                  parent = parent.parentElement;
                }
                return el;
              });
              elementToClick = parentButton.asElement();
            }
            
            session.log(`[Exit] 🎯 Clicking verified close button: ${selector}`);
            
            // Try multiple click methods for better success rate
            let clickSuccess = false;
            
            // Method 1: Touch tap (current method)
            try {
              await touchTapHandle(page, elementToClick);
              await sleep(rInt(300, 500));
              
              const backToFeed = await page.evaluate(() => {
                return !document.querySelector('div[role="dialog"]') && 
                       window.location.href.includes('instagram.com') &&
                       !window.location.href.includes('/stories/');
              });
              
              if (backToFeed) {
                session.log(`[Exit] ✅ Success via close button touch tap (selector: ${selector})`);
                return true;
              }
            } catch (error) {
              session.log(`[Exit] ⚠️ Touch tap failed: ${error.message}`);
            }
            
            // Method 2: Mobile click if touch failed
            try {
              const mobileClickSuccess = await mobileClick(page, elementToClick, {
                waitForVisible: false,
                scrollIntoView: true,
                useTouch: true,
                addDelay: true
              });
              
              if (mobileClickSuccess) {
                await sleep(rInt(300, 500));
                
                const backToFeed = await page.evaluate(() => {
                  return !document.querySelector('div[role="dialog"]') && 
                         window.location.href.includes('instagram.com') &&
                         !window.location.href.includes('/stories/');
                });
                
                if (backToFeed) {
                  session.log(`[Exit] ✅ Success via close button mobile click (selector: ${selector})`);
                  return true;
                }
              } else {
                session.log(`[Exit] ⚠️ Mobile click failed: ${selector}`);
              }
            } catch (error) {
              session.log(`[Exit] ⚠️ Mobile click error: ${error.message}`);
            }
            
            // Method 3: JavaScript click as last resort
            try {
              await elementToClick.evaluate(el => el.click());
              await sleep(rInt(300, 500));
              
              const backToFeed = await page.evaluate(() => {
                return !document.querySelector('div[role="dialog"]') && 
                       window.location.href.includes('instagram.com') &&
                       !window.location.href.includes('/stories/');
              });
              
              if (backToFeed) {
                session.log(`[Exit] ✅ Success via close button JS click (selector: ${selector})`);
                return true;
              }
            } catch (error) {
              session.log(`[Exit] ⚠️ JS click failed: ${error.message}`);
            }
            
            session.log(`[Exit] ⚠️ All click methods failed for close button: ${selector}`);
          }
        } catch (error) {
          session.log(`[Exit] ⚠️ Selector failed: ${selector} - ${error.message}`);
        }
      }
    }
    
         session.log(`[Exit] ❌ Failed via close button after ${maxAttempts} attempts`);
     session.log(`[Exit] ↩️ Falling back to Escape key`);
     
     try {
       await page.keyboard.press('Escape');
       await sleep(rInt(500, 1000));
      
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

// ============================================================================
// MAIN STORY WATCHING FUNCTION
// ============================================================================

async function watchStories(page, durationSeconds = 60, accountId = 'unknown') {
  if (!FEATURE_FLAGS.storySCv1) {
    session.log(`[Feature] storySCv1 disabled, using legacy system`);
    // Fallback to legacy system
    return await watchStoriesLegacy(page, durationSeconds, accountId);
  }
  
     // Initialize session
   const session = new StorySession(accountId, durationSeconds);
   
     // 🚫 REMOVED: enableTouchEmulation - Let AdsPower handle touch settings natively
   
   // Navigate to stories
   const navigationSuccess = await navigateToStories(page, session);
   if (!navigationSuccess) {
     session.log(`[Stories] Failed to navigate to stories`);
     return { ok: true, storiesWatched: 0, reactionsSent: 0, durationSec: 0, accountId, note: 'no_stories_available' };
   }
   
   let currentUsername = '';
   let visitedProfiles = new Set(); // Track which profiles we've already visited
   
   // Main loop driven by SC and fatigue only
   while (true) {
    try {
                   // Check session stop conditions (PBM system - only SC and fatigue)
      if (session.scRemaining <= 1.0) {
        session.log(`[Session] Ending: SC ≤ 1.0 (${session.scRemaining.toFixed(2)})`);
        break;
      }
      
      if (session.fatigue >= 1.25) {
        session.log(`[Session] Ending: fatigue ≥ 1.25 (${session.fatigue.toFixed(3)})`);
      break;
      }
      
             // Check if we're in a story
       const storyActive = await isStoryActive(page);
       if (!storyActive) {
         session.log(`[Stories] Not in story view, attempting to navigate...`);
         
         const navSuccess = await navigateToStories(page, session, visitedProfiles);
         if (!navSuccess) {
           session.log(`[Stories] Navigation failed, retrying in 2-4 seconds...`);
           await sleep(rInt(2000, 4000));
           continue;
         }
         
    await sleep(rInt(500, 1000));
         continue;
       }
    
      // Get current story info
      const storyInfo = await page.evaluate(() => {
      const url = window.location.href;
      const storyUser = url.match(/\/stories\/([^\/]+)\//)?.[1] || 'unknown';
        return { user: storyUser, url };
      });
      
      // Check if this is a new account
      const isNewAccount = currentUsername !== storyInfo.user;
      
      if (isNewAccount) {
        // Apply BAR from previous account
        if (currentUsername) {
          const barBoost = computeBAR(session);
          if (barBoost > 0) {
            session.scRemaining = Math.min(
              session.scRemaining + barBoost,
              session.scStartMode * SC_CONFIG.barHardCapMultiplier
            );
            session.barCount++;
            session.log(`[BAR] Applied: +${barBoost.toFixed(2)} SC (total: ${session.scRemaining.toFixed(2)})`);
          }
        }
        
        // Initialize new account
        currentUsername = storyInfo.user;
        
        // Carry over 25% boredom to next account (PBM system)
        const carriedBoredom = session.boredom * SC_CONFIG.pbm.boredomCarryOver;
        session.resetAccountState();
        session.boredom = carriedBoredom; // Set carried boredom after reset
        session.prevStoryUrl = storyInfo.url;
        
        session.log(`[Account] New account: ${currentUsername}, carried boredom: ${carriedBoredom.toFixed(3)}`);
        
        // Maybe start StreakBreaker
        if (session.fatigue <= 0.70 && Math.random() < SC_CONFIG.streakBreakerChance) {
          session.streakBreaker.active = true;
          session.streakBreaker.slidesLeft = rInt(SC_CONFIG.streakBreakerDuration[0], SC_CONFIG.streakBreakerDuration[1]);
          session.log(`[StreakBreaker] Started: ${session.streakBreaker.slidesLeft} slides`);
        }
        
        // Consume rare long run token
        if (session.rareLongRunToken && session.fatigue <= 0.70) {
          session.streakBreaker.active = true;
          session.streakBreaker.slidesLeft = rInt(SC_CONFIG.rareLongRunDuration[0], SC_CONFIG.rareLongRunDuration[1]);
          session.rareLongRunToken = false;
          session.usedRareLongRun = true;
          session.log(`[RareLongRun] Consumed: ${session.streakBreaker.slidesLeft} slides`);
        }
        
        session.log(`[Account] New account: ${currentUsername}`);
      }
      
      // Check for interest spike
      session.interestSpike = false;
      if (session.slideIdx <= 2 && session.fatigue <= 0.8 && Math.random() < SC_CONFIG.interestSpikeChance) {
        session.interestSpike = true;
        session.boredom = Math.max(0, session.boredom - SC_CONFIG.interestSpikeBoredomReduction);
        session.log(`[Interest] Spike triggered on slide ${session.slideIdx + 1}`);
      }
      
      // Check for rare slowdown trigger
      if (shouldTriggerRareSlowdown(session)) {
        startRareSlowdown(session);
      }
      
      // Compute skip propensity
      const pSkip = computeSkipPropensity(session);
      
      // Decide skip vs watch
      if (Math.random() < pSkip) {
        // Skip
        session.log(`[Slide] Skipping slide ${session.slideIdx + 1} (pSkip: ${(pSkip * 100).toFixed(1)}%)`);
        
        // PBM: Compute skip delay with progressive acceleration
        const baselineDelay = rFloat(200, 500); // Baseline skip delay
        let skipDelay = baselineDelay;
        
        if (session.rareSlowdown.active) {
          // Rare slowdown override: use 1.8x to 3.0x baseline
          const slowdownMultiplier = rFloat(SC_CONFIG.pbm.rareSlowdownRange[0], SC_CONFIG.pbm.rareSlowdownRange[1]);
          skipDelay = baselineDelay * slowdownMultiplier;
          session.log(`[RareSlowdown] Override: ${baselineDelay.toFixed(0)}ms → ${skipDelay.toFixed(0)}ms (${slowdownMultiplier.toFixed(2)}x)`);
    } else {
          // Normal PBM calculation
          const pbm = computePBM(session);
          skipDelay = baselineDelay * pbm;
          
          // Apply micro outlier (3% chance)
          skipDelay = applyMicroOutlier(skipDelay, session);
        }
        
        await sleep(skipDelay);
        
        // Update PBM state
        session.boredom += 0.05;
        session.skipStreak++; // Increment skip streak
        session.slideIdx++;
        
        // Handle rare slowdown decay
        if (session.rareSlowdown.active) {
          session.rareSlowdown.tapsLeft--;
          session.rareSlowdown.forcedLongDwell = false; // Only force on first tap
          
          if (session.rareSlowdown.tapsLeft <= 0) {
            session.rareSlowdown.active = false;
            session.skipStreak = 0; // Reset streak when slowdown ends
            session.log(`[RareSlowdown] Ended, reset skip streak`);
    } else {
            session.log(`[RareSlowdown] ${session.rareSlowdown.tapsLeft} taps remaining`);
          }
        }
           
                      // Smart navigation with human-like retry behavior
           const navigationResult = await smartNavigateToNextSlide(page, session);
           
           if (navigationResult.success) {
             session.prevStoryUrl = navigationResult.newUrl;
             session.slideIdx++;
             // Reset navigation failure count on success
             session.navigationFailures = 0;
           } else {
             // Navigation failed - track and handle gracefully
             session.navigationFailures++;
             session.log(`[SmartNav] ⚠️ Story seems unresponsive (failure ${session.navigationFailures}/${session.maxNavigationFailures})`);
             
             // Check if we should skip this account entirely
             if (session.navigationFailures >= session.maxNavigationFailures) {
               session.log(`[SmartNav] 🚫 Account seems problematic (${session.navigationFailures} failures), moving to next account`);
               
               // Exit current account gracefully
               const exitSuccess = await exitViaCloseButton(page, session);
               if (exitSuccess) {
                 session.logAccountExit(currentUsername, session.slidesWatchedHere, session.scSpentHere, session.scRemaining, session.fatigue, 0, 'account_problematic');
               }
               
               // Small pause before next account
               await sleep(rInt(600, 1200));
               continue;
             }
             
             // Small human-like pause before continuing with same account
             await sleep(rInt(800, 1500));
             continue;
           }
  } else {
        // Watch
        session.log(`[Slide] Watching slide ${session.slideIdx + 1} (pSkip: ${(pSkip * 100).toFixed(1)}%)`);
        
        // Choose dwell category (force Long if rare slowdown requires it)
        let dwellCategory = chooseDwellCategory(session);
        if (session.rareSlowdown.forcedLongDwell) {
          dwellCategory = 'Long';
          session.log(`[RareSlowdown] Forcing Long dwell on first tap`);
        }
        
        const dwellValues = sampleDwellValues(dwellCategory);
        
        session.log(`[Slide] Dwell: ${dwellCategory} (${dwellValues.duration.toFixed(1)}s)`);
        
        // Watch the slide
        await sleep(dwellValues.duration * 1000);
        
        // Apply costs
        session.scRemaining -= dwellValues.scCost;
        session.scSpentHere += dwellValues.scCost;
        session.fatigue = Math.min(1.5, session.fatigue + dwellValues.fatigue);
        session.slidesWatchedHere++;
        session.boredom += 0.10;
        
        session.log(`[Slide] SC: -${dwellValues.scCost.toFixed(2)} (remaining: ${session.scRemaining.toFixed(2)}), Fatigue: +${dwellValues.fatigue.toFixed(3)} (total: ${session.fatigue.toFixed(3)})`);
        
        // Micro-pause
        if (Math.random() < SC_CONFIG.microPauseChance) {
          const pauseDuration = rFloat(SC_CONFIG.microPauseDuration[0], SC_CONFIG.microPauseDuration[1]);
          const pauseFatigue = rFloat(SC_CONFIG.microPauseFatigue[0], SC_CONFIG.microPauseFatigue[1]);
          
          session.log(`[Pause] Micro-pause: ${pauseDuration.toFixed(1)}s`);
          await sleep(pauseDuration * 1000);
          
          session.fatigue = Math.min(1.5, session.fatigue + pauseFatigue);
        }
        
        // Reset skip streak on watch
        session.skipStreak = 0;
        session.slideIdx++;
        
                                  // Smart navigation with human-like retry behavior
         const navigationResult = await smartNavigateToNextSlide(page, session);
         
         if (navigationResult.success) {
           session.prevStoryUrl = navigationResult.newUrl;
           session.slideIdx++;
           // Reset navigation failure count on success
           session.navigationFailures = 0;
      } else {
           // Navigation failed - track and handle gracefully
           session.navigationFailures++;
           session.log(`[SmartNav] ⚠️ Story seems unresponsive (failure ${session.navigationFailures}/${session.maxNavigationFailures})`);
           
           // Check if we should skip this account entirely
           if (session.navigationFailures >= session.maxNavigationFailures) {
             session.log(`[SmartNav] 🚫 Account seems problematic (${session.navigationFailures} failures), moving to next account`);
             
             // Exit current account gracefully
             const exitSuccess = await exitViaCloseButton(page, session);
             if (exitSuccess) {
               session.logAccountExit(currentUsername, session.slidesWatchedHere, session.scSpentHere, session.scRemaining, session.fatigue, 0, 'account_problematic');
             }
             
             // Small pause before next account
             await sleep(rInt(600, 1200));
             continue;
           }
           
           // Small human-like pause before continuing with same account
           await sleep(rInt(800, 1500));
           continue;
         }
      }
      
      // StreakBreaker decay
      if (session.streakBreaker.active) {
        session.streakBreaker.slidesLeft--;
        if (session.streakBreaker.slidesLeft <= 0) {
          session.streakBreaker.active = false;
          session.log(`[StreakBreaker] Ended`);
        }
      }
      
      // PBM: No account-based exits - only session-level exits
      // Account boredom now drives progressive speed acceleration via PBM
      // Session continues until SC ≤ 1.0 or fatigue ≥ 1.25
      
      // Small delay between slides
      await sleep(rInt(200, 800));
      
      } catch (error) {
      session.log(`[Stories] Error in story loop: ${error.message}`);
      await sleep(1000);
    }
  }
  
     // Apply BAR from final account
   if (currentUsername) {
     const barBoost = computeBAR(session);
     if (barBoost > 0) {
       session.scRemaining = Math.min(
         session.scRemaining + barBoost,
         session.scStartMode * SC_CONFIG.barHardCapMultiplier
       );
       session.barCount++;
       session.log(`[BAR] Applied: +${barBoost.toFixed(2)} SC (total: ${session.scRemaining.toFixed(2)})`);
     }
     
     // Determine final exit reason (PBM system)
     let finalReason = 'done';
     if (session.scRemaining <= 1.0) {
       finalReason = 'low_sc';
     } else if (session.fatigue >= 1.25) {
       finalReason = 'fatigue_stop';
     }
     
     session.logAccountExit(currentUsername, session.slidesWatchedHere, session.scSpentHere, session.scRemaining, session.fatigue, barBoost, finalReason);
   }
  
     const actualDuration = Math.round((now() - session.startTime) / 1000);
   return {
     ok: true,
     storiesWatched: session.slidesWatchedHere,
     reactionsSent: 0, // No reactions in new system
     durationSec: actualDuration,
     accountId,
     finalSC: session.scRemaining,
     finalFatigue: session.fatigue
   };
}

// ============================================================================
// LEGACY SYSTEM (fallback)
// ============================================================================

async function watchStoriesLegacy(page, durationSeconds = 60, accountId = 'unknown') {
  // Simple fallback implementation
  console.log(`[Legacy] Using legacy story watching system`);
  
  const startTime = now();
  const endTime = startTime + (durationSeconds * 1000);
  
  // 🚫 REMOVED: enableTouchEmulation - Let AdsPower handle touch settings natively
  
  const navigationSuccess = await navigateToStories(page, { log: console.log });
  if (!navigationSuccess) {
    return { ok: true, storiesWatched: 0, reactionsSent: 0, durationSec: 0, accountId, note: 'no_stories_available' };
  }
  
  let storiesWatched = 0;
  
  while (now() < endTime) {
    try {
      const storyActive = await isStoryActive(page);
      if (!storyActive) {
        const navSuccess = await navigateToStories(page, { log: console.log });
        if (!navSuccess) break;
        await sleep(rInt(500, 1000));
        continue;
      }
      
      // Simple watch behavior
      const dwellTime = rFloat(2, 5);
      await sleep(dwellTime * 1000);
      storiesWatched++;
      
      // Advance to next
      await storyTapNext(page, { log: () => {} });
      await sleep(rInt(200, 800));
      
  } catch (error) {
      console.log(`[Legacy] Error: ${error.message}`);
      await sleep(1000);
    }
  }
  
  const actualDuration = Math.round((now() - startTime) / 1000);
  return {
    ok: true,
    storiesWatched,
    reactionsSent: 0,
    durationSec: actualDuration,
    accountId
  };
}

module.exports = {
  watchStories,
  FEATURE_FLAGS,
  StorySession,
  generateRandomizedTapPosition,
  SC_CONFIG
};
