const fs = require('fs').promises;
const path = require('path');

class LikeRateCalculator {
  constructor(configPath) {
    this.configPath = configPath;
    this.config = null;
    this.likeRates = null;
  }

  async initialize() {
    try {
      this.config = JSON.parse(await fs.readFile(path.join(this.configPath, 'like-rates.json'), 'utf8'));
      console.log('📊 Like Rate Calculator initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Like Rate Calculator:', error.message);
      throw error;
    }
  }

  /**
   * Calculate like probability for a post
   */
  calculateLikeRate(mood, contentType, sessionShape, state, sessionMemory, postMetadata = {}) {
    try {
      // Get base rate from mood configuration
      const moodConfig = this.config.moods[mood];
      if (!moodConfig) {
        throw new Error(`Unknown mood: ${mood}`);
      }

      // Get base rate for content type
      const baseRate = this.getBaseRateForContentType(moodConfig, contentType);
      
      // Apply global gates
      let adjustedRate = this.applyGlobalGates(baseRate, state, sessionMemory, postMetadata);
      
      // Apply session shape multiplier
      adjustedRate = this.applySessionShapeMultiplier(adjustedRate, sessionShape);
      
      // Apply risk tier adjustment
      adjustedRate = this.applyRiskTierAdjustment(adjustedRate, state);
      
      // Apply decay based on recent likes
      adjustedRate = this.applyDecay(adjustedRate, state, sessionMemory);
      
      // Apply scarcity scaling if needed
      adjustedRate = this.applyScarcityScaling(adjustedRate, state, sessionMemory);
      
      // Ensure rate is within valid bounds
      adjustedRate = Math.max(0, Math.min(1, adjustedRate));
      
      return {
        rate: adjustedRate,
        baseRate,
        adjustments: {
          globalGates: this.getGlobalGatesAdjustment(state, sessionMemory, postMetadata),
          sessionShape: this.getSessionShapeMultiplier(sessionShape),
          riskTier: this.getRiskTierMultiplier(state),
          decay: this.getDecayMultiplier(state, sessionMemory),
          scarcity: this.getScarcityMultiplier(state, sessionMemory)
        }
      };
      
    } catch (error) {
      console.error('❌ Like rate calculation failed:', error.message);
      return { rate: 0, baseRate: 0, error: error.message };
    }
  }

  /**
   * Get base rate for content type
   */
  getBaseRateForContentType(moodConfig, contentType) {
    const rates = moodConfig[contentType];
    if (!rates) {
      console.log(`⚠️  No rates found for content type: ${contentType}, using followed rates`);
      return this.randomBetween(moodConfig.followed.min, moodConfig.followed.max) / 100;
    }
    
    return this.randomBetween(rates.min, rates.max) / 100;
  }

  /**
   * Apply global gates to like rate
   */
  applyGlobalGates(baseRate, state, sessionMemory, postMetadata) {
    let adjustedRate = baseRate;
    
    // Ad gate - never like ads
    if (postMetadata.isAd) {
      return 0;
    }
    
    // Min dwell gate - ensure minimum exposure time
    if (postMetadata.dwellTime && postMetadata.dwellTime < this.config.globalGates.minDwellMs) {
      adjustedRate *= 0.1; // Severely reduce rate
    }
    
    // Familiarity bump - increase rate for familiar accounts (apply early)
    if (postMetadata.username && sessionMemory.isFamiliarAccount(state.profileId, postMetadata.username)) {
      adjustedRate *= this.config.globalGates.familiarityBump;
    }
    
    // Anti-streak gate - limit consecutive likes
    const likeWindow = sessionMemory.getLikeWindow(state.profileId);
    if (likeWindow.length >= this.config.globalGates.antiStreakMax) {
      adjustedRate *= 0.1; // Freeze likes
    }
    
    // Post-like cooldown - reduce rate after recent like
    if (this.hasRecentLike(sessionMemory, state.profileId)) {
      adjustedRate *= (1 - this.config.globalGates.postLikeCooldown);
    }
    
    // First-lap caution - reduce rate for first few posts
    if (this.isFirstLap(state)) {
      adjustedRate *= this.config.globalGates.firstLapCaution;
    }
    
    // Caption-expanded bump - increase rate if caption was expanded
    if (postMetadata.captionExpanded) {
      adjustedRate += this.config.globalGates.captionExpandedBump;
    }
    
    return adjustedRate;
  }

  /**
   * Apply session shape multiplier
   */
  applySessionShapeMultiplier(rate, sessionShape) {
    const shapeConfig = this.config.sessionShapes[sessionShape];
    if (shapeConfig) {
      return rate * shapeConfig.likeMultiplier;
    }
    return rate;
  }

  /**
   * Apply risk tier adjustment
   */
  applyRiskTierAdjustment(rate, state) {
    const riskTier = this.determineRiskTier(state);
    const riskConfig = this.config.riskTiers[riskTier];
    
    if (riskConfig) {
      return rate * riskConfig.likeScalar;
    }
    return rate;
  }

  /**
   * Apply decay based on recent likes
   */
  applyDecay(rate, state, sessionMemory) {
    const recentLikes = this.getRecentLikeCount(state, sessionMemory);
    const decayFactor = Math.pow(this.config.decay.successDecay, recentLikes);
    
    return rate * decayFactor;
  }

  /**
   * Apply scarcity scaling
   */
  applyScarcityScaling(rate, state, sessionMemory) {
    const scarcityObservations = sessionMemory.getScarcityObservations(state.profileId);
    const isScarcity = this.detectScarcity(scarcityObservations);
    
    if (isScarcity) {
      const scarcityScaler = this.config.decay.scarcityScaler;
      let scaledRate = rate * scarcityScaler;
      
      // Clamp to low end if configured
      if (this.config.decay.scarcityClampToLow) {
        const moodConfig = this.config.moods[state.mood];
        if (moodConfig) {
          const lowEndRate = moodConfig.followed.min / 100;
          scaledRate = Math.max(scaledRate, lowEndRate * scarcityScaler);
        }
      }
      
      return scaledRate;
    }
    
    return rate;
  }

  /**
   * Check if post has recent like
   */
  hasRecentLike(sessionMemory, profileId) {
    const likeWindow = sessionMemory.getLikeWindow(profileId);
    return likeWindow.length > 0;
  }

  /**
   * Check if this is first lap (first few posts)
   */
  isFirstLap(state) {
    const postsSeen = state.postsSeenInSession || 0;
    return postsSeen < 3;
  }

  /**
   * Get recent like count
   */
  getRecentLikeCount(state, sessionMemory) {
    const likeWindow = sessionMemory.getLikeWindow(state.profileId);
    return likeWindow.length;
  }

  /**
   * Determine risk tier
   */
  determineRiskTier(state) {
    const accountAge = state.accountAge || 0;
    const recentBlocks = state.recentBlocks || 0;
    
    if (accountAge < 30 || recentBlocks > 0) {
      return 'NewCold';
    } else if (accountAge < 180) {
      return 'Warming';
    } else {
      return 'Seasoned';
    }
  }

  /**
   * Detect scarcity from observations
   */
  detectScarcity(scarcityObservations) {
    if (!scarcityObservations || scarcityObservations.length === 0) return false;
    
    const recentObservations = scarcityObservations.slice(-3);
    const avgFollowedRatio = recentObservations.reduce((sum, obs) => sum + obs.followedRatio, 0) / recentObservations.length;
    
    return avgFollowedRatio < 0.4;
  }

  /**
   * Get global gates adjustment info
   */
  getGlobalGatesAdjustment(state, sessionMemory, postMetadata) {
    const adjustments = [];
    
    if (postMetadata.isAd) adjustments.push('adBlocked');
    if (postMetadata.dwellTime && postMetadata.dwellTime < this.config.globalGates.minDwellMs) adjustments.push('minDwellNotMet');
    if (this.hasRecentLike(sessionMemory, state.profileId)) adjustments.push('antiStreak');
    if (this.isFirstLap(state)) adjustments.push('firstLapCaution');
    if (postMetadata.username && sessionMemory.isFamiliarAccount(state.profileId, postMetadata.username)) adjustments.push('familiarityBump');
    if (postMetadata.captionExpanded) adjustments.push('captionExpandedBump');
    
    return adjustments;
  }

  /**
   * Get session shape multiplier
   */
  getSessionShapeMultiplier(sessionShape) {
    const shapeConfig = this.config.sessionShapes[sessionShape];
    return shapeConfig ? shapeConfig.likeMultiplier : 1.0;
  }

  /**
   * Get risk tier multiplier
   */
  getRiskTierMultiplier(state) {
    const riskTier = this.determineRiskTier(state);
    const riskConfig = this.config.riskTiers[riskTier];
    return riskConfig ? riskConfig.likeScalar : 1.0;
  }

  /**
   * Get decay multiplier
   */
  getDecayMultiplier(state, sessionMemory) {
    const recentLikes = this.getRecentLikeCount(state, sessionMemory);
    return Math.pow(this.config.decay.successDecay, recentLikes);
  }

  /**
   * Get scarcity multiplier
   */
  getScarcityMultiplier(state, sessionMemory) {
    const scarcityObservations = sessionMemory.getScarcityObservations(state.profileId);
    const isScarcity = this.detectScarcity(scarcityObservations);
    return isScarcity ? this.config.decay.scarcityScaler : 1.0;
  }

  /**
   * Check if like should be attempted
   */
  shouldAttemptLike(rate, postMetadata) {
    // Never like ads
    if (postMetadata.isAd) {
      return { shouldLike: false, reason: 'adBlocked' };
    }
    
    // Check minimum dwell time
    if (postMetadata.dwellTime && postMetadata.dwellTime < this.config.globalGates.minDwellMs) {
      return { shouldLike: false, reason: 'minDwellNotMet' };
    }
    
    // Random decision based on rate
    const shouldLike = Math.random() < rate;
    
    return {
      shouldLike,
      reason: shouldLike ? 'rateBased' : 'rateBased',
      rate
    };
  }

  /**
   * Get like method (double-tap vs button)
   */
  getLikeMethod() {
    return Math.random() < 0.7 ? 'doubleTap' : 'button';
  }

  /**
   * Calculate dwell time for post
   */
  calculateDwellTime(postMetadata, sessionShape, state) {
    let baseDwell;
    
    if (postMetadata.isVideo) {
      // Video: 25-60% of loop duration, cap 7-12s
      const videoDuration = postMetadata.videoDuration || 15; // Default 15s
      const percentage = this.randomBetween(0.25, 0.60);
      baseDwell = Math.min(videoDuration * percentage * 1000, this.randomBetween(7000, 12000));
    } else {
      // Photo: 1.4-3.2s
      baseDwell = this.randomBetween(1400, 3200);
    }
    
    // Apply session shape adjustments
    if (sessionShape === 'DeepRead') {
      baseDwell *= 1.5; // Longer dwells for deep read
    } else if (sessionShape === 'SkimBounce') {
      baseDwell *= 0.7; // Shorter dwells for skim bounce
    }
    
    // Add caption expansion time
    if (postMetadata.captionExpanded) {
      baseDwell += this.randomBetween(600, 3500);
    }
    
    // Add familiarity bonus
    if (postMetadata.isFamiliar) {
      baseDwell *= this.randomBetween(1.1, 1.25);
    }
    
    // Add micro-pauses for long reads
    if (baseDwell > 5000) {
      const microPauses = Math.floor(Math.random() * 3) + 1; // 1-3 pauses
      baseDwell += microPauses * this.randomBetween(180, 420);
    }
    
    return Math.round(baseDwell);
  }

  /**
   * Utility: random between min and max
   */
  randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  }

  /**
   * Get daily like budget
   */
  getDailyLikeBudget(state) {
    const riskTier = this.determineRiskTier(state);
    const riskConfig = this.config.riskTiers[riskTier];
    return riskConfig ? riskConfig.dailyFence : 100;
  }

  /**
   * Check if daily budget is exceeded
   */
  isDailyBudgetExceeded(state) {
    const likesToday = state.likesToday || 0;
    const dailyBudget = this.getDailyLikeBudget(state);
    const threshold = 0.9; // 90% threshold
    
    return likesToday >= (dailyBudget * threshold);
  }
}

module.exports = LikeRateCalculator;
