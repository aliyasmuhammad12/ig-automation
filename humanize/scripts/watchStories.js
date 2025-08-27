// humanize/scripts/watchStories.js
// Story watching automation with new session-based SC system and progressive decision-making

const { getMood } = require('../moods');

const now = () => Date.now();
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const rFloat = (a, b) => a + Math.random() * (b - a);
const rInt = (a, b) => Math.floor(rFloat(a, b + 1));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const clamp01 = (n) => clamp(n, 0, 1);

// ============================================================================
// FEATURE FLAG
// ============================================================================

const FEATURE_FLAGS = {
  storySCv1: true // Enabled for testing the new system
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
  
  // Account exit
  boredomExitThreshold: 1.10,
  boredomExitFatigueThreshold: 0.9,
  boredomExitScThreshold: 2,
  
  // Navigation
  urlChangeTimeout: 1800,
  urlPollInterval: [80, 150],
  navFlakyCooldown: [1200, 2800],
  betweenAccountsDelay: [600, 2200]
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
// NAVIGATION HELPER
// ============================================================================

async function handleNavigationFailure(page, session, currentUsername) {
  // Check if this is likely end of user's stories vs actual navigation failure
  const isLikelyEndOfStories = session.slidesWatchedHere <= 3 && session.slideIdx <= 2;
  
  if (isLikelyEndOfStories) {
    session.log(`[Navigation] ✅ Reached end of user's stories (${session.slidesWatchedHere} slides watched)`);
    
    // Exit account normally
    const exitSuccess = await exitViaCloseButton(page, session);
    if (exitSuccess) {
      const barBoost = computeBAR(session);
      if (barBoost > 0) {
        session.scRemaining = Math.min(
          session.scRemaining + barBoost,
          session.scStartMode * SC_CONFIG.barHardCapMultiplier
        );
        session.barCount++;
        session.log(`[BAR] Applied: +${barBoost.toFixed(2)} SC (total: ${session.scRemaining.toFixed(2)})`);
      }
      
      session.logAccountExit(currentUsername, session.slidesWatchedHere, session.scSpentHere, session.scRemaining, session.fatigue, barBoost, 'done');
    }
    
    // Pause before next account
    const delay = rInt(SC_CONFIG.betweenAccountsDelay[0], SC_CONFIG.betweenAccountsDelay[1]);
    await sleep(delay);
    return 'done';
  } else {
    session.log(`[Navigation] ❌ Failed to advance after retries, marking nav_flaky`);
    const cooldown = rInt(SC_CONFIG.navFlakyCooldown[0], SC_CONFIG.navFlakyCooldown[1]);
    await sleep(cooldown);
    
    // Exit account with nav_flaky reason
    const exitSuccess = await exitViaCloseButton(page, session);
    if (exitSuccess) {
      session.logAccountExit(currentUsername, session.slidesWatchedHere, session.scSpentHere, session.scRemaining, session.fatigue, 0, 'nav_flaky');
    }
    return 'nav_flaky';
  }
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
  
  const tapX = rInt(vpDims.w * 0.75, vpDims.w * 0.95);
  const tapY = rInt(vpDims.h * 0.35, vpDims.h * 0.65);
  
  const offsetX = rInt(-10, 10);
  const offsetY = rInt(-15, 15);
  const finalX = Math.max(1, Math.min(vpDims.w - 2, tapX + offsetX));
  const finalY = Math.max(1, Math.min(vpDims.h - 2, tapY + offsetY));
  
  session.log(`[Continue] 👉 Tapped right side for next slide (${finalX}, ${finalY})`);
  
  try {
    const cdp = await page.target().createCDPSession();
    
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
    
    await sleep(rInt(80, 150));
    
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

async function navigateToStories(page, session) {
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
          
          // If no unread stories, try any non-"Your story"
          if (!storyButton) {
            for (let j = 0; j < storyElements.length; j++) {
              const element = storyElements[j];
              const storyInfo = await element.evaluate(el => {
                const isYourStory = el.querySelector('img[alt*="profile" i]') && 
                                  (el.textContent.includes('Your story') || 
                                   el.getAttribute('aria-label')?.includes('Your story') ||
                                   el.querySelector('div[data-testid="add-to-story"]'));
                
                // Check if story is viewed/expired
                const hasGrayBorder = el.querySelector('circle[stroke="#dbdbdb"], circle[stroke="#8e8e96"]');
                const hasNoBorder = !el.querySelector('circle[stroke]');
                const isViewed = hasGrayBorder || hasNoBorder;
                
                return {
                  isYourStory,
                  isViewed,
                  hasGrayBorder: !!hasGrayBorder,
                  hasNoBorder: !!hasNoBorder,
                  ariaLabel: el.getAttribute('aria-label') || 'none',
                  textContent: el.textContent?.substring(0, 50) || 'none'
                };
              });
              
              if (!storyInfo.isYourStory) {
                storyButton = element;
                session.log(`[Stories] Using story at index ${j} (viewed: ${storyInfo.isViewed}, aria: "${storyInfo.ariaLabel}")`);
                break;
              }
            }
          }
          
          if (!storyButton && storyElements.length > 0) {
            storyButton = storyElements[0];
            session.log(`[Stories] Using first available story (last resort)`);
          }
          
          if (storyButton) {
            await touchTapHandle(page, storyButton);
            await sleep(rInt(1000, 2000));
            session.log(`[Stories] Clicked story element with selector: ${selector}`);
            
            await sleep(2000);
            const isInStoryView = await isStoryActive(page);
            
            if (isInStoryView) {
              session.log(`[Stories] Successfully entered story view`);
              return true;
            } else {
              session.log(`[Stories] Failed to enter story view, trying next selector`);
              continue;
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
    } else {
      session.log(`[Stories] No story elements found`);
    }
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
    const closeSelectors = [
      'div[role="button"]:has(circle)',
      'button[aria-label="Close"]',
      'div[role="button"] svg[aria-label="Close"]',
    ];
    
    let attempts = 0;
    const maxAttempts = 2;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      for (const selector of closeSelectors) {
        try {
          session.log(`[Exit] Attempt ${attempts}/${maxAttempts} → Trying close button: ${selector}`);
          
          await page.waitForSelector(selector, { timeout: 2000 });
          const closeButton = await page.$(selector);
          
          if (closeButton) {
            const isVisible = await closeButton.isVisible();
            if (!isVisible) {
              session.log(`[Exit] ⚠️ Selector found but not visible: ${selector}`);
              continue;
            }
            
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
            
            await touchTapHandle(page, elementToClick);
            await sleep(rInt(500, 1000));
            
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
  
  const startTime = now();
  const endTime = startTime + (durationSeconds * 1000);
  
  // Enable touch emulation
  await enableTouchEmulation(page);
  
  // Navigate to stories
  const navigationSuccess = await navigateToStories(page, session);
  if (!navigationSuccess) {
    session.log(`[Stories] Failed to navigate to stories`);
    return { ok: true, storiesWatched: 0, reactionsSent: 0, durationSec: 0, accountId, note: 'no_stories_available' };
  }
  
  let currentUsername = '';
  let navFlakyCount = 0;
  
  while (now() < endTime) {
    try {
      // Check session stop conditions
      if (session.scRemaining <= 0) {
        session.log(`[Session] Ending: SC exhausted (${session.scRemaining.toFixed(2)})`);
        break;
      }
      
      if (session.fatigue >= SC_CONFIG.fatigueHardStop) {
        session.log(`[Session] Ending: Hard fatigue stop (${session.fatigue.toFixed(3)})`);
        break;
      }
      
      if (session.fatigue >= SC_CONFIG.fatigueSoftStop && Math.random() < 0.7) {
        session.log(`[Session] Ending: Soft fatigue stop (${session.fatigue.toFixed(3)})`);
        break;
      }
      
      // Check if we're in a story
      const storyActive = await isStoryActive(page);
      if (!storyActive) {
        session.log(`[Stories] Not in story view, attempting to navigate...`);
        
        navFlakyCount++;
        if (navFlakyCount > 3) {
          session.log(`[Session] Ending: Too many navigation failures`);
          break;
        }
        
        const navSuccess = await navigateToStories(page, session);
        if (!navSuccess) {
          session.log(`[Stories] Navigation failed (attempt ${navFlakyCount}/3)`);
          await sleep(rInt(2000, 4000));
          continue;
        } else {
          navFlakyCount = 0;
        }
        
        await sleep(rInt(500, 1000));
        continue;
      }
      
      navFlakyCount = 0;
      
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
        session.resetAccountState();
        session.prevStoryUrl = storyInfo.url;
        
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
      
      // Compute skip propensity
      const pSkip = computeSkipPropensity(session);
      
      // Decide skip vs watch
      if (Math.random() < pSkip) {
        // Skip
        session.log(`[Slide] Skipping slide ${session.slideIdx + 1} (pSkip: ${(pSkip * 100).toFixed(1)}%)`);
        
        const skipDwell = rFloat(0.2, 0.5);
        await sleep(skipDwell * 1000);
        
        session.boredom += 0.05;
        session.slideIdx++;
        
        // Advance to next slide
        const tapSuccess = await storyTapNext(page, session);
        if (tapSuccess) {
          const newUrl = await waitForUrlChange(page, session);
          if (newUrl && newUrl !== session.prevStoryUrl) {
            session.prevStoryUrl = newUrl;
            session.log(`[Navigation] ✅ Advanced to next slide`);
          } else {
            session.log(`[Navigation] ⚠️ URL didn't change, retrying...`);
            
            // Retry tap a couple times
            let retryCount = 0;
            while (retryCount < 3) {
              retryCount++;
              await storyTapNext(page, session);
              const retryUrl = await waitForUrlChange(page, session);
              if (retryUrl && retryUrl !== session.prevStoryUrl) {
                session.prevStoryUrl = retryUrl;
                session.log(`[Navigation] ✅ Advanced on retry ${retryCount}`);
                break;
              }
            }
            
            if (retryCount >= 3) {
              await handleNavigationFailure(page, session, currentUsername);
              continue;
            }
          }
        }
      } else {
        // Watch
        session.log(`[Slide] Watching slide ${session.slideIdx + 1} (pSkip: ${(pSkip * 100).toFixed(1)}%)`);
        
        // Choose dwell category
        const dwellCategory = chooseDwellCategory(session);
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
        
        session.slideIdx++;
        
        // Advance to next slide
        const tapSuccess = await storyTapNext(page, session);
        if (tapSuccess) {
          const newUrl = await waitForUrlChange(page, session);
          if (newUrl && newUrl !== session.prevStoryUrl) {
            session.prevStoryUrl = newUrl;
            session.log(`[Navigation] ✅ Advanced to next slide`);
          } else {
            session.log(`[Navigation] ⚠️ URL didn't change, retrying...`);
            
            // Retry tap a couple times
            let retryCount = 0;
            while (retryCount < 3) {
              retryCount++;
              await storyTapNext(page, session);
              const retryUrl = await waitForUrlChange(page, session);
              if (retryUrl && retryUrl !== session.prevStoryUrl) {
                session.prevStoryUrl = retryUrl;
                session.log(`[Navigation] ✅ Advanced on retry ${retryCount}`);
                break;
              }
            }
            
            if (retryCount >= 3) {
              await handleNavigationFailure(page, session, currentUsername);
              continue;
            }
          }
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
      
      // Account early exit
      if (session.boredom >= SC_CONFIG.boredomExitThreshold && 
          (session.fatigue >= SC_CONFIG.boredomExitFatigueThreshold || session.scRemaining <= SC_CONFIG.boredomExitScThreshold)) {
        session.log(`[Account] Early exit: boredom ${session.boredom.toFixed(2)}, fatigue ${session.fatigue.toFixed(3)}, SC ${session.scRemaining.toFixed(2)}`);
        
        const exitSuccess = await exitViaCloseButton(page, session);
        if (exitSuccess) {
          const barBoost = computeBAR(session);
          if (barBoost > 0) {
            session.scRemaining = Math.min(
              session.scRemaining + barBoost,
              session.scStartMode * SC_CONFIG.barHardCapMultiplier
            );
            session.barCount++;
            session.log(`[BAR] Applied: +${barBoost.toFixed(2)} SC (total: ${session.scRemaining.toFixed(2)})`);
          }
          
          session.logAccountExit(currentUsername, session.slidesWatchedHere, session.scSpentHere, session.scRemaining, session.fatigue, barBoost, 'bored_tired');
        }
        
        // Pause before next account
        const delay = rInt(SC_CONFIG.betweenAccountsDelay[0], SC_CONFIG.betweenAccountsDelay[1]);
        await sleep(delay);
        
        continue;
      }
      
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
    
    session.logAccountExit(currentUsername, session.slidesWatchedHere, session.scSpentHere, session.scRemaining, session.fatigue, barBoost, 'done');
  }
  
  const actualDuration = Math.round((now() - startTime) / 1000);
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
  
  await enableTouchEmulation(page);
  
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
  FEATURE_FLAGS
};
