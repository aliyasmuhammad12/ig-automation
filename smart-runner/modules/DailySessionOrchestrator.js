const fs = require('fs').promises;
const path = require('path');

class DailySessionOrchestrator {
  constructor(configPath) {
    this.configPath = configPath;
    this.config = null;
    this.sessionShapes = null;
    this.likeRates = null;
  }

  async initialize() {
    try {
      // Load configuration files
      this.config = JSON.parse(await fs.readFile(path.join(this.configPath, 'daily-orchestrator.json'), 'utf8'));
      this.sessionShapes = JSON.parse(await fs.readFile(path.join(this.configPath, 'session-shapes.json'), 'utf8'));
      this.likeRates = JSON.parse(await fs.readFile(path.join(this.configPath, 'like-rates.json'), 'utf8'));
      
      console.log('🎯 Daily Session Orchestrator initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Daily Session Orchestrator:', error.message);
      throw error;
    }
  }

  /**
   * Determine if a session should run based on gating rules
   */
  async shouldRunSession(profileId, state, sessionMemory) {
    const now = new Date();
    
    // Check minimum gap between sessions
    if (!this.checkMinGap(state, now)) {
      return { shouldRun: false, reason: 'minGapNotMet' };
    }

    // Check freshness gate
    const freshnessCheck = await this.checkFreshnessGate(profileId, state, sessionMemory);
    if (!freshnessCheck.passed) {
      return { shouldRun: false, reason: 'freshnessGate', details: freshnessCheck };
    }

    // Check fatigue throttle
    if (this.checkFatigueThrottle(state)) {
      return { shouldRun: false, reason: 'fatigueThrottle' };
    }

    // Check daily budget
    if (this.checkDailyBudget(state)) {
      return { shouldRun: false, reason: 'dailyBudgetExceeded' };
    }

    return { shouldRun: true, freshnessCheck };
  }

  /**
   * Select appropriate session shape based on daypart and history
   */
  selectSessionShape(profileId, state, sessionMemory) {
    const now = new Date();
    const daypart = this.getCurrentDaypart(now);
    const daypartConfig = this.config.daypartWeights[daypart];
    
    if (!daypartConfig) {
      console.log(`⚠️  Unknown daypart: ${daypart}, using Morning as fallback`);
      return this.selectSessionShapeFromWeights(this.config.daypartWeights.Morning.shapes, state, sessionMemory);
    }

    // Apply no-op realism
    if (this.shouldApplyNoOpRealism(state, sessionMemory)) {
      return { shape: 'MicroCheck', reason: 'noOpRealism', exitEarly: true };
    }

    // Avoid repeating same shape
    const weights = this.adjustWeightsForHistory(daypartConfig.shapes, state, sessionMemory);
    
    return this.selectSessionShapeFromWeights(weights, state, sessionMemory);
  }

  /**
   * Calculate session parameters based on shape and mood
   */
  calculateSessionParams(shape, mood, state, sessionMemory) {
    const shapeConfig = this.sessionShapes[shape];
    const moodConfig = this.likeRates.moods[mood];
    const riskTier = this.determineRiskTier(state);
    const riskConfig = this.likeRates.riskTiers[riskTier];

    if (!shapeConfig || !moodConfig || !riskConfig) {
      throw new Error(`Invalid configuration: shape=${shape}, mood=${mood}, riskTier=${riskTier}`);
    }

    // Calculate duration
    const duration = this.calculateDuration(shapeConfig, state, sessionMemory);

    // Calculate like caps
    const likeCaps = this.calculateLikeCaps(moodConfig, shapeConfig, riskConfig, state);

    // Calculate action parameters
    const actions = this.calculateActions(shapeConfig, state);

    return {
      shape,
      mood,
      duration,
      likeCaps,
      actions,
      riskTier,
      exitConditions: shapeConfig.exitConditions
    };
  }

  /**
   * Check minimum gap between sessions
   */
  checkMinGap(state, now) {
    if (!state.lastActiveAt) return true;
    
    const lastActive = new Date(state.lastActiveAt);
    const timeSinceLastSession = now - lastActive;
    const minGapMs = this.config.sessionGating.minGapMinutes.min * 60 * 1000;
    
    return timeSinceLastSession >= minGapMs;
  }

  /**
   * Check freshness gate - peek top posts for new content
   */
  async checkFreshnessGate(profileId, state, sessionMemory) {
    const config = this.config.sessionGating.freshnessGate;
    
    // This would integrate with browser automation to check top posts
    // For now, simulate the check
    const lastSeenIds = sessionMemory.getLastSeenIds(profileId);
    const newPostsCount = this.simulateNewPostsCount(lastSeenIds);
    
    if (newPostsCount < config.minNewPosts) {
      return {
        passed: false,
        reason: 'insufficientNewPosts',
        newPostsCount,
        required: config.minNewPosts
      };
    }

    // Check for same accounts at top
    const topAccounts = this.simulateTopAccounts();
    if (topAccounts.length >= config.sameAccountThreshold) {
      return {
        passed: false,
        reason: 'sameAccountsAtTop',
        topAccounts
      };
    }

    return { passed: true, newPostsCount, topAccounts };
  }

  /**
   * Check if fatigue throttle should be applied
   */
  checkFatigueThrottle(state) {
    const threshold = this.config.sessionGating.fatigueThreshold;
    const likesToday = state.likesToday || 0;
    const dailyBudget = this.getDailyBudget(state);
    
    return (likesToday / dailyBudget) > threshold;
  }

  /**
   * Check daily budget constraints
   */
  checkDailyBudget(state) {
    const likesToday = state.likesToday || 0;
    const dailyBudget = this.getDailyBudget(state);
    const threshold = this.config.dailyBudgeting.budgetThreshold;
    
    return likesToday >= (dailyBudget * (1 - threshold));
  }

  /**
   * Get current daypart based on time
   */
  getCurrentDaypart(now) {
    const hour = now.getHours();
    
    if (hour >= 7 && hour < 11) return 'Morning';
    if (hour >= 12 && hour < 17) return 'Afternoon';
    if (hour >= 18 && hour < 23) return 'Evening';
    if (hour >= 23 || hour < 2) return 'LateNight';
    
    return 'Morning'; // Default fallback
  }

  /**
   * Check if no-op realism should be applied
   */
  shouldApplyNoOpRealism(state, sessionMemory) {
    const noOpRate = this.config.noOpRealism.totalNoOpRate;
    const sessionsToday = state.sessionsToday || 0;
    
    // Increase probability if already had many sessions today
    const adjustedRate = Math.min(noOpRate + (sessionsToday * 0.02), 0.25);
    
    return Math.random() < adjustedRate;
  }

  /**
   * Adjust session shape weights based on history
   */
  adjustWeightsForHistory(baseWeights, state, sessionMemory) {
    const lastSession = sessionMemory.getLastSession();
    const adjustedWeights = { ...baseWeights };
    
    if (lastSession && lastSession.shape) {
      // Reduce weight of last session shape
      if (adjustedWeights[lastSession.shape]) {
        adjustedWeights[lastSession.shape] *= 0.3;
      }
    }
    
    return adjustedWeights;
  }

  /**
   * Select session shape from weighted options
   */
  selectSessionShapeFromWeights(weights, state, sessionMemory) {
    const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const [shape, weight] of Object.entries(weights)) {
      random -= weight;
      if (random <= 0) {
        return { shape, reason: 'weightedSelection' };
      }
    }
    
    // Fallback to first available shape
    const firstShape = Object.keys(weights)[0];
    return { shape: firstShape, reason: 'fallback' };
  }

  /**
   * Calculate session duration
   */
  calculateDuration(shapeConfig, state, sessionMemory) {
    const baseMin = shapeConfig.duration.min * 1000; // Convert seconds to milliseconds
    const baseMax = shapeConfig.duration.max * 1000; // Convert seconds to milliseconds
    
    // Apply scarcity adjustment if needed
    const scarcityObservations = sessionMemory.getScarcityObservations(state.profileId);
    const isScarcity = this.detectScarcity(scarcityObservations);
    
    if (isScarcity && shapeConfig.name !== 'DeepRead') {
      // Cap duration under scarcity
      const scarcityCap = this.config.scarcityBehavior.sessionCapMinutes.max * 60 * 1000;
      return Math.min(this.randomBetween(baseMin, baseMax), scarcityCap);
    }
    
    return this.randomBetween(baseMin, baseMax);
  }

  /**
   * Calculate like caps for session
   */
  calculateLikeCaps(moodConfig, shapeConfig, riskConfig, state) {
    const followedMin = moodConfig.followed.min;
    const followedMax = moodConfig.followed.max;
    const suggestedMin = moodConfig.suggested.min;
    const suggestedMax = moodConfig.suggested.max;
    const maxPerSession = moodConfig.maxPerSession;
    
    // Apply risk tier scalar
    const riskScalar = riskConfig.likeScalar;
    
    // Apply shape multiplier
    const shapeMultiplier = this.likeRates.sessionShapes[shapeConfig.name]?.likeMultiplier || 1.0;
    
    return {
      followed: {
        min: Math.round(followedMin * riskScalar * shapeMultiplier),
        max: Math.round(followedMax * riskScalar * shapeMultiplier)
      },
      suggested: {
        min: Math.round(suggestedMin * riskScalar * shapeMultiplier),
        max: Math.round(suggestedMax * riskScalar * shapeMultiplier)
      },
      maxPerSession: Math.round(maxPerSession * riskScalar * shapeMultiplier)
    };
  }

  /**
   * Calculate action parameters
   */
  calculateActions(shapeConfig, state) {
    return {
      pullRefresh: Math.random() < shapeConfig.actions.pullRefresh,
      scanPosts: shapeConfig.actions.scanPosts,
      commentOpens: shapeConfig.actions.commentOpens,
      profileHops: shapeConfig.actions.profileHops,
      captionExpansions: shapeConfig.actions.captionExpansions,
      saves: shapeConfig.actions.saves,
      fastFlicks: shapeConfig.actions.fastFlicks || false,
      longerDwells: shapeConfig.actions.longerDwells || false
    };
  }

  /**
   * Determine account risk tier
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
   * Get daily budget based on risk tier
   */
  getDailyBudget(state) {
    const riskTier = this.determineRiskTier(state);
    return this.likeRates.riskTiers[riskTier].dailyFence;
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
   * Simulate new posts count (placeholder for browser integration)
   */
  simulateNewPostsCount(lastSeenIds) {
    // This would be replaced with actual browser automation
    // For testing, always return enough new posts
    return Math.floor(Math.random() * 5) + 5; // 5-9 new posts
  }

  /**
   * Simulate top accounts (placeholder for browser integration)
   */
  simulateTopAccounts() {
    // This would be replaced with actual browser automation
    return Math.random() < 0.3 ? ['account1', 'account2'] : [];
  }

  /**
   * Utility: random between min and max
   */
  randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  }
}

module.exports = DailySessionOrchestrator;
