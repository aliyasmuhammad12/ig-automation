#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Import new modules
const DailySessionOrchestrator = require('./modules/DailySessionOrchestrator');
const HomeFeedScroller = require('./modules/HomeFeedScroller');
const SessionMemory = require('./modules/SessionMemory');

class SmartRunner {
  constructor(podName) {
    this.podName = podName;
    this.config = null;
    this.moods = null;
    this.runnerGroups = null;
    this.profiles = [];
    this.globalSemaphore = 1;
    this.isRunning = false;
    this.tickInterval = null;
    this.currentSession = null;
    
    // New orchestrator components
    this.orchestrator = null;
    this.homeFeedScroller = null;
    this.sessionMemory = null;
  }

  async initialize() {
    try {
      // Load configuration files
      this.config = JSON.parse(await fs.readFile(path.join(__dirname, 'config', 'smart-runner.json'), 'utf8'));
      this.moods = JSON.parse(await fs.readFile(path.join(__dirname, 'config', 'moods.json'), 'utf8'));
      this.runnerGroups = JSON.parse(await fs.readFile(path.join(__dirname, 'data', 'runner-groups.json'), 'utf8'));

      // Get profiles for this pod
      const pod = this.runnerGroups.pods.find(p => p.pod === this.podName);
      if (!pod) {
        throw new Error(`Pod ${this.podName} not found in runner-groups.json`);
      }
      this.profiles = pod.profiles;

      console.log(`🚀 Smart Runner initialized for pod: ${this.podName}`);
      console.log(`📊 Profiles: ${this.profiles.join(', ')}`);
      console.log(`⚙️  Concurrency: ${this.config.concurrency}`);

      // Initialize database collections
      await this.initializeDatabase();

      // Initialize new orchestrator components
      await this.initializeOrchestrator();

      // Clear stale running flags
      await this.clearStaleFlags();

      // Set initial eligibility with jitter
      await this.setInitialEligibility();

    } catch (error) {
      console.error('❌ Failed to initialize Smart Runner:', error.message);
      process.exit(1);
    }
  }

  async initializeDatabase() {
    // Initialize database collections if using MongoDB
    // For now, we'll use JSON files as the client specified "local database"
    const dbPath = path.join(__dirname, 'data');
    
    // Ensure database files exist
    const collections = ['runner_state.json', 'runner_events.json', 'runner_summaries.json'];
    for (const collection of collections) {
      const filePath = path.join(dbPath, collection);
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, '[]', 'utf8');
      }
    }
  }

  async initializeOrchestrator() {
    try {
      const configPath = path.join(__dirname, 'config');
      const dataPath = path.join(__dirname, 'data');
      
      // Initialize orchestrator components
      this.orchestrator = new DailySessionOrchestrator(configPath);
      this.homeFeedScroller = new HomeFeedScroller(configPath, dataPath);
      this.sessionMemory = new SessionMemory(dataPath);
      
      await Promise.all([
        this.orchestrator.initialize(),
        this.homeFeedScroller.initialize(),
        this.sessionMemory.initialize()
      ]);
      
      console.log('🎯 Daily Session Orchestrator components initialized');
    } catch (error) {
      console.error('❌ Failed to initialize orchestrator components:', error.message);
      throw error;
    }
  }

  async clearStaleFlags() {
    console.log('🧹 Clearing stale running flags...');
    const statePath = path.join(__dirname, 'data', 'runner_state.json');
    try {
      const states = JSON.parse(await fs.readFile(statePath, 'utf8'));
      for (const state of states) {
        if (state.flags && state.flags.running) {
          state.flags.running = false;
          state.flags.needsRecovery = false;
        }
      }
      await fs.writeFile(statePath, JSON.stringify(states, null, 2), 'utf8');
    } catch (error) {
      console.log('⚠️  No existing state file found, creating new one');
    }
  }

  async setInitialEligibility() {
    console.log('⏰ Setting initial eligibility with jitter...');
    const now = new Date();
    const jitterMs = this.generateHandoffJitter();
    const initialDelay = new Date(now.getTime() + jitterMs);

    for (const profileId of this.profiles) {
      await this.updateRunnerState(profileId, {
        nextEligibleAt: initialDelay.toISOString(),
        lastActiveAt: null,
        startsToday: 0,
        energy: 100,
        flags: { running: false, needsRecovery: false, paused: false },
        errorStreak: 0,
        pausedUntil: null
      });
    }
  }

  generateHandoffJitter() {
    // Log-normal distribution with mode ≈ 54s
    const mode = this.config.handoff.modeMs;
    const min = this.config.handoff.minMs;
    const max = this.config.handoff.maxMs;
    
    // Approximate log-normal using Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    
    // Scale to approximate log-normal with desired mode
    const jitter = Math.exp(z0 * 0.5) * mode;
    
    return Math.max(min, Math.min(max, jitter));
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️  Runner is already running');
      return;
    }

    this.isRunning = true;
    console.log(`🎯 Starting Smart Runner for pod: ${this.podName}`);
    
    // Start the main tick loop
    this.tickInterval = setInterval(() => {
      this.tick().catch(error => {
        console.error('❌ Error in tick loop:', error);
      });
    }, 120000); // Every 2 minutes

    // Run initial tick
    await this.tick();
  }

  async tick() {
    if (this.globalSemaphore <= 0) {
      console.log('🔒 Global semaphore busy, skipping tick');
      return;
    }

    console.log(`\n🔄 Tick started at ${new Date().toISOString()}`);
    
    // Rotate through profiles
    for (const profileId of this.profiles) {
      try {
        const result = await this.processAccount(profileId);
        if (result.action === 'started') {
          break; // Only one session at a time
        }
      } catch (error) {
        console.error(`❌ Error processing account ${profileId}:`, error.message);
        await this.logEvent(profileId, 'error', 'tick', { error: error.message });
      }
    }
  }

  async processAccount(profileId) {
    const state = await this.getRunnerState(profileId);
    if (!state) {
      console.log(`⚠️  No state found for ${profileId}, initializing...`);
      await this.initializeAccountState(profileId);
      return { action: 'initialized' };
    }

    // Check if account is paused
    if (state.flags && state.flags.paused) {
      if (state.pausedUntil && new Date(state.pausedUntil) > new Date()) {
        console.log(`⏸️  Account ${profileId} is paused until ${state.pausedUntil}`);
        return { action: 'paused' };
      } else {
        // Pause period expired, unpause the account
        console.log(`▶️  Unpausing account ${profileId} (pause period expired)`);
        await this.updateRunnerState(profileId, {
          flags: { ...state.flags, paused: false },
          pausedUntil: null,
          errorStreak: 0 // Reset error streak when unpausing
        });
        await this.logEvent(profileId, 'unpause', 'recovery', { reason: 'pausePeriodExpired' });
      }
    }

    // Check if account is running
    if (state.flags && state.flags.running) {
      console.log(`⏳ Account ${profileId} is already running`);
      return { action: 'running' };
    }

    // Check if account needs recovery (non-blocking)
    if (state.flags && state.flags.needsRecovery) {
      console.log(`🔧 Account ${profileId} needs recovery`);
      // Run recovery in background to avoid blocking global concurrency
      setImmediate(() => {
        this.attemptRecovery(profileId).catch(error => {
          console.error(`❌ Recovery error for ${profileId}:`, error);
        });
      });
      return { action: 'recovery' };
    }

    // Plan next activity
    const plan = await this.planActivity(profileId, state);
    
    if (plan.action === 'skip') {
      console.log(`⏭️  Skipping ${profileId}: ${plan.reason}`);
      await this.logEvent(profileId, 'skip', 'idle', { skipReason: plan.reason });
      return { action: 'skipped', reason: plan.reason };
    }

    if (plan.action === 'start') {
      console.log(`🚀 Starting ${plan.type} for ${profileId} with params:`, plan.params);
      await this.startSession(profileId, plan);
      return { action: 'started', type: plan.type };
    }

    return { action: 'unknown' };
  }

  async planActivity(profileId, state) {
    const now = new Date();
    
    // Sleep check
    if (this.isInSleepWindow(now, state)) {
      return { action: 'skip', reason: 'sleepWindow' };
    }

    // Eligibility check
    if (state.nextEligibleAt && new Date(state.nextEligibleAt) > now) {
      return { action: 'skip', reason: 'notEligible' };
    }

    // Get current mood and daypart
    const mood = this.getCurrentMood(now, state);
    const daypart = this.getCurrentDaypart(now, state);

    // Build candidate activities with weights
    const candidates = await this.buildCandidateActivities(profileId, state, mood, daypart);
    
    if (candidates.length === 0) {
      return { action: 'skip', reason: 'noTargets' };
    }

    // Select activity using weighted random
    const selected = this.selectWeightedActivity(candidates, profileId);
    
    // Calculate next eligibility
    const nextEligibleAt = this.calculateNextEligibility(now, mood, state);
    
    // Update state
    await this.updateRunnerState(profileId, {
      nextEligibleAt: nextEligibleAt.toISOString(),
      lastActiveAt: now.toISOString(),
      startsToday: (state.startsToday || 0) + 1,
      energy: Math.max(0, (state.energy || 100) - 10),
      mood: mood,
      daypart: daypart
    });

    return {
      action: 'start',
      type: selected.type,
      params: selected.params,
      mood: mood,
      daypart: daypart
    };
  }

  async buildCandidateActivities(profileId, state, mood, daypart) {
    const candidates = [];
    const baseWeights = this.config.weights.base;
    const moodMultipliers = this.moods[mood].weightMultipliers;

    // Home Feed (new primary activity with orchestrator)
    if (this.shouldIncludeHomeFeed(state, mood)) {
      const homeFeedWeight = baseWeights.homefeed || 0.6; // Default weight if not configured
      const adjustedWeight = homeFeedWeight * (moodMultipliers.homefeed || 1.0);
      candidates.push({
        type: 'homefeed',
        weight: adjustedWeight,
        params: { 
          useOrchestrator: true,
          mood: mood,
          daypart: daypart
        }
      });
    }

    // Follow
    if (await this.hasTargets(profileId, 'follow')) {
      const weight = baseWeights.follow * moodMultipliers.follow;
      candidates.push({
        type: 'follow',
        weight: weight,
        params: { count: 10 } // Default count, can be made configurable
      });
    }

    // Unfollow (rare trigger)
    if (this.shouldIncludeUnfollow(state)) {
      const weight = baseWeights.unfollow * moodMultipliers.unfollow;
      candidates.push({
        type: 'unfollow',
        weight: weight,
        params: { count: 5 } // Default count
      });
    }

    // Reels (secondary activity)
    const reelsWeight = baseWeights.reels * moodMultipliers.reels;
    candidates.push({
      type: 'reels',
      weight: reelsWeight,
      params: { seconds: 300 } // Default 5 minutes
    });

    // Stories (fluid rarity)
    if (this.shouldIncludeStories(state, mood)) {
      const storiesWeight = baseWeights.stories * moodMultipliers.stories;
      const adjustedWeight = this.adjustStoriesWeight(storiesWeight, state);
      candidates.push({
        type: 'stories',
        weight: adjustedWeight,
        params: { seconds: 120 } // Default 2 minutes
      });
    }

    return candidates;
  }

  shouldIncludeHomeFeed(state, mood) {
    // Check if orchestrator is available
    if (!this.orchestrator) {
      return false;
    }
    
    // Check daily budget constraints
    const dailyCounters = this.sessionMemory.getDailyCounters(state.profileId);
    const maxSessionsPerDay = 6; // From orchestrator config
    if (dailyCounters.sessions >= maxSessionsPerDay) {
      return false;
    }
    
    // Check if homefeed was run very recently
    if (state.homefeedLastAt) {
      const lastHomefeed = new Date(state.homefeedLastAt);
      const now = new Date();
      const timeSinceHomefeed = now - lastHomefeed;
      if (timeSinceHomefeed < 60 * 60 * 1000) { // 60 minutes
        return false;
      }
    }
    
    return true;
  }

  shouldIncludeUnfollow(state) {
    const threshold = this.config.unfollowTrigger.threshold;
    return (state.startsToday || 0) >= threshold;
  }

  shouldIncludeStories(state, mood) {
    // Suppress if stories were run very recently
    if (state.storiesLastAt) {
      const lastStories = new Date(state.storiesLastAt);
      const now = new Date();
      const timeSinceStories = now - lastStories;
      if (timeSinceStories < 90 * 60 * 1000) { // 90 minutes
        return false;
      }
    }
    return true;
  }

  adjustStoriesWeight(baseWeight, state) {
    // Reduce weight as startsToday rises
    const startsToday = state.startsToday || 0;
    const reduction = Math.min(0.8, startsToday * 0.1);
    return baseWeight * (1 - reduction);
  }

  selectWeightedActivity(candidates, profileId) {
    const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const candidate of candidates) {
      random -= candidate.weight;
      if (random <= 0) {
        return candidate;
      }
    }
    
    // Fallback to last candidate
    return candidates[candidates.length - 1];
  }

  calculateNextEligibility(now, mood, state) {
    const moodConfig = this.moods[mood];
    
    // Check for burst opportunity
    if (this.config.bursts.enabled && this.shouldAllowBurst(state, moodConfig)) {
      const burstDelay = this.randomBetween(this.config.bursts.minMs, this.config.bursts.maxMs);
      return new Date(now.getTime() + burstDelay);
    }
    
    // Normal idle spacing
    const baseMin = this.config.idle.baseMinMs;
    const baseMax = this.config.idle.baseMaxMs;
    const idleDelay = this.randomBetween(baseMin, baseMax) * moodConfig.idleMultiplier;
    
    return new Date(now.getTime() + idleDelay);
  }

  shouldAllowBurst(state, moodConfig) {
    const energy = state.energy || 100;
    const energyFactor = energy / 100;
    const burstProb = this.config.bursts.probability * moodConfig.burstMultiplier * energyFactor;
    
    return Math.random() < burstProb;
  }

  async startSession(profileId, plan) {
    this.globalSemaphore = 0; // Acquire semaphore
    
    const sessionId = uuidv4();
    this.currentSession = { profileId, sessionId, plan, startTime: Date.now() };
    
    // Update state
    await this.updateRunnerState(profileId, {
      flags: { running: true, needsRecovery: false }
    });

    // Log session start
    await this.logEvent(profileId, 'start', plan.type, plan.params, sessionId);

    // Handle homefeed sessions with orchestrator
    if (plan.type === 'homefeed' && plan.params.useOrchestrator) {
      await this.startHomeFeedSession(profileId, plan, sessionId);
    } else {
      // Start child process for other activities
      const childProcess = this.spawnChildProcess(plan.type, profileId, plan.params);
      
      childProcess.on('close', async (code) => {
        await this.handleSessionEnd(profileId, sessionId, code);
      });

      childProcess.on('error', async (error) => {
        console.error(`❌ Child process error for ${profileId}:`, error);
        await this.handleSessionError(profileId, sessionId, error);
      });
    }
  }

  async startHomeFeedSession(profileId, plan, sessionId) {
    try {
      console.log(`🏠 Starting homefeed session with orchestrator for ${profileId}`);
      
      // Get current state
      const state = await this.getRunnerState(profileId);
      
      // Check if session should run using orchestrator
      const shouldRun = await this.orchestrator.shouldRunSession(profileId, state, this.sessionMemory);
      
      if (!shouldRun.shouldRun) {
        console.log(`⏭️  Homefeed session skipped: ${shouldRun.reason}`);
        await this.logEvent(profileId, 'skip', 'homefeed', { skipReason: shouldRun.reason }, sessionId);
        await this.handleSessionEnd(profileId, sessionId, 0);
        return;
      }
      
      // Select session shape
      const shapeSelection = this.orchestrator.selectSessionShape(profileId, state, this.sessionMemory);
      
      // Calculate session parameters
      const sessionParams = this.orchestrator.calculateSessionParams(
        shapeSelection.shape,
        plan.params.mood,
        state,
        this.sessionMemory
      );
      
      console.log(`🎭 Selected session shape: ${shapeSelection.shape} (${shapeSelection.reason})`);
      console.log(`📊 Session parameters:`, sessionParams);
      
      // Start child process for homefeed script
      const childProcess = this.spawnChildProcess('homefeed', profileId, {
        ...plan.params,
        sessionParams: sessionParams,
        orchestratorData: {
          shape: shapeSelection.shape,
          reason: shapeSelection.reason,
          freshnessCheck: shouldRun.freshnessCheck
        }
      });
      
      childProcess.on('close', async (code) => {
        await this.handleSessionEnd(profileId, sessionId, code);
      });

      childProcess.on('error', async (error) => {
        console.error(`❌ Homefeed session error for ${profileId}:`, error);
        await this.handleSessionError(profileId, sessionId, error);
      });
      
    } catch (error) {
      console.error(`❌ Failed to start homefeed session for ${profileId}:`, error.message);
      await this.handleSessionError(profileId, sessionId, error);
    }
  }

  spawnChildProcess(type, profileId, params) {
    const scriptMap = {
      'follow': 'main.js',
      'unfollow': 'unfollow.js',
      'reels': 'humanize/run.js',
      'stories': 'humanize/runStories.js',
      'homefeed': 'humanize/runHomeFeed.js',
      'simulate-failure': 'smart-runner/simulate-failure.js'
    };

    const scriptPath = path.join(__dirname, '..', scriptMap[type]);
    const args = [];
    
    if (type === 'simulate-failure') {
      // Special handling for simulate-failure script
      args.push('--profile', profileId);
      if (params.failureType) {
        args.push('--type', params.failureType);
      }
      if (params.exitCode) {
        args.push('--exitCode', params.exitCode.toString());
      }
      if (params.duration) {
        args.push('--duration', params.duration.toString());
      }
    } else {
      // Standard handling for other scripts
      args.push(profileId);
      if (params.count) {
        args.push(params.count.toString());
      }
      if (params.seconds) {
        args.push(params.seconds.toString());
      }
    }

    console.log(`🚀 Spawning: node ${scriptPath} ${args.join(' ')}`);
    
    return spawn('node', [scriptPath, ...args], {
      cwd: path.join(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe']
    });
  }

  async handleSessionEnd(profileId, sessionId, exitCode) {
    const duration = Date.now() - (this.currentSession?.startTime || Date.now());
    const state = await this.getRunnerState(profileId);
    
    if (exitCode === 0) {
      console.log(`✅ Session completed successfully for ${profileId}`);
      await this.logEvent(profileId, 'finish', this.currentSession?.plan?.type, 
        this.currentSession?.plan?.params, sessionId, 'ok', duration);
      
      // Reset error streak on successful completion
      await this.updateRunnerState(profileId, {
        flags: { running: false, needsRecovery: false },
        errorStreak: 0
      });
      
      // Update activity timestamps
      if (this.currentSession?.plan?.type === 'stories') {
        await this.updateRunnerState(profileId, {
          storiesLastAt: new Date().toISOString()
        });
      } else if (this.currentSession?.plan?.type === 'homefeed') {
        await this.updateRunnerState(profileId, {
          homefeedLastAt: new Date().toISOString()
        });
      }
    } else {
      console.log(`❌ Session failed for ${profileId} with exit code ${exitCode}`);
      await this.logEvent(profileId, 'error', this.currentSession?.plan?.type,
        this.currentSession?.plan?.params, sessionId, 'error', duration);
      
      // Increment error streak and trigger recovery
      const newErrorStreak = (state?.errorStreak || 0) + 1;
      await this.updateRunnerState(profileId, {
        flags: { running: false, needsRecovery: true },
        errorStreak: newErrorStreak
      });
      
      console.log(`📊 Error streak for ${profileId}: ${newErrorStreak}`);
    }

    // Release semaphore
    this.globalSemaphore = 1;
    this.currentSession = null;
  }

  async handleSessionError(profileId, sessionId, error) {
    console.error(`❌ Session error for ${profileId}:`, error.message);
    await this.logEvent(profileId, 'error', this.currentSession?.plan?.type,
      this.currentSession?.plan?.params, sessionId, 'error');
    
    // Increment error streak and trigger recovery
    const state = await this.getRunnerState(profileId);
    const newErrorStreak = (state?.errorStreak || 0) + 1;
    await this.updateRunnerState(profileId, {
      flags: { running: false, needsRecovery: true },
      errorStreak: newErrorStreak
    });
    
    console.log(`📊 Error streak for ${profileId}: ${newErrorStreak}`);

    // Release semaphore
    this.globalSemaphore = 1;
    this.currentSession = null;
  }

  async attemptRecovery(profileId) {
    console.log(`🔧 Attempting recovery for ${profileId}`);
    
    const state = await this.getRunnerState(profileId);
    if (!state) {
      console.log(`⚠️  No state found for ${profileId}, skipping recovery`);
      return;
    }

    // Check if error streak exceeds maximum
    const errorStreak = state.errorStreak || 0;
    const maxErrorStreak = this.config.recovery.maxErrorStreak;
    
    if (errorStreak > maxErrorStreak) {
      console.log(`⏸️  Profile ${profileId} paused for the day (error streak: ${errorStreak})`);
      await this.logEvent(profileId, 'pause', 'recovery', { 
        reason: 'maxErrorStreakExceeded', 
        errorStreak: errorStreak,
        maxErrorStreak: maxErrorStreak 
      });
      
      // Mark as paused for the day
      await this.updateRunnerState(profileId, {
        flags: { running: false, needsRecovery: false, paused: true },
        pausedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours from now
      });
      return;
    }

    const maxSteps = this.config.recovery.maxRecoverySteps;
    let recovered = false;
    let lastError = null;
    
    for (let step = 1; step <= maxSteps; step++) {
      console.log(`🔧 Recovery step ${step}/${maxSteps} for ${profileId}`);
      
      try {
        const stepResult = await this.executeRecoveryStep(profileId, step);
        
        if (stepResult.success) {
          console.log(`✅ Recovery step ${step} successful for ${profileId}`);
          await this.logEvent(profileId, 'recover', 'recovery', { 
            step: step, 
            outcome: 'ok',
            action: stepResult.action 
          });
          recovered = true;
          break;
        } else {
          console.log(`⚠️  Recovery step ${step} failed for ${profileId}: ${stepResult.error}`);
          await this.logEvent(profileId, 'recover', 'recovery', { 
            step: step, 
            outcome: 'failed',
            error: stepResult.error,
            action: stepResult.action 
          });
          lastError = stepResult.error;
        }
      } catch (error) {
        console.log(`⚠️  Recovery step ${step} failed for ${profileId}:`, error.message);
        await this.logEvent(profileId, 'recover', 'recovery', { 
          step: step, 
          outcome: 'failed',
          error: error.message,
          action: this.getRecoveryStepAction(step)
        });
        lastError = error.message;
      }
      
      // Wait before next step (except for last step)
      if (step < maxSteps) {
        await new Promise(resolve => setTimeout(resolve, this.config.recovery.retryBackoffMs));
      }
    }
    
    if (recovered) {
      console.log(`✅ Recovery successful for ${profileId}`);
      await this.updateRunnerState(profileId, {
        flags: { running: false, needsRecovery: false },
        errorStreak: 0
      });
    } else {
      console.log(`❌ Recovery failed for ${profileId} after ${maxSteps} steps: ${lastError}`);
      await this.updateRunnerState(profileId, {
        flags: { running: false, needsRecovery: true }
      });
    }
  }

  async executeRecoveryStep(profileId, step) {
    const actions = {
      1: 'goToHomepage',
      2: 'browserBack', 
      3: 'refreshPage',
      4: 'reopenProfile',
      5: 'restartAdsPowerProfile'
    };

    const action = actions[step];
    if (!action) {
      throw new Error(`Invalid recovery step: ${step}`);
    }

    try {
      const result = await this[action](profileId);
      return { success: true, action: action, result: result };
    } catch (error) {
      return { success: false, action: action, error: error.message };
    }
  }

  getRecoveryStepAction(step) {
    const actions = {
      1: 'goToHomepage',
      2: 'browserBack',
      3: 'refreshPage', 
      4: 'reopenProfile',
      5: 'restartAdsPowerProfile'
    };
    return actions[step] || 'unknown';
  }

  // Recovery step implementations
  async goToHomepage(profileId) {
    console.log(`🏠 Step 1: Going to homepage for ${profileId}`);
    // This would integrate with your browser automation
    // For now, simulate the action
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { message: 'Navigated to homepage' };
  }

  async browserBack(profileId) {
    console.log(`⬅️  Step 2: Browser back for ${profileId}`);
    // This would integrate with your browser automation
    // For now, simulate the action
    await new Promise(resolve => setTimeout(resolve, 1500));
    return { message: 'Browser back executed' };
  }

  async refreshPage(profileId) {
    console.log(`🔄 Step 3: Refreshing page for ${profileId}`);
    // This would integrate with your browser automation
    // For now, simulate the action
    await new Promise(resolve => setTimeout(resolve, 3000));
    return { message: 'Page refreshed' };
  }

  async reopenProfile(profileId) {
    console.log(`🔓 Step 4: Reopening profile for ${profileId}`);
    // This would integrate with AdsPower API
    // For now, simulate the action
    await new Promise(resolve => setTimeout(resolve, 5000));
    return { message: 'Profile reopened' };
  }

  async restartAdsPowerProfile(profileId) {
    console.log(`🔄 Step 5: Restarting AdsPower profile for ${profileId}`);
    // This would integrate with AdsPower API
    // For now, simulate the action
    await new Promise(resolve => setTimeout(resolve, 8000));
    return { message: 'AdsPower profile restarted' };
  }

  // Utility methods
  isInSleepWindow(now, state) {
    const sleepWindow = state.sleepWindow || { start: "01:00", end: "07:30" };
    const currentTime = now.toTimeString().substring(0, 5);
    return currentTime >= sleepWindow.start || currentTime <= sleepWindow.end;
  }

  getCurrentMood(now, state) {
    const hour = now.getHours();
    const minute = now.getMinutes();
    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    
    for (const [mood, config] of Object.entries(this.moods)) {
      const [start, end] = config.timeRange.split('-');
      if (this.isTimeInRange(timeStr, start, end)) {
        return mood;
      }
    }
    
    return 'DayDrift'; // Default fallback
  }

  getCurrentDaypart(now, state) {
    return this.getCurrentMood(now, state); // Same as mood for now
  }

  isTimeInRange(time, start, end) {
    if (start <= end) {
      return time >= start && time <= end;
    } else {
      // Crosses midnight
      return time >= start || time <= end;
    }
  }

  async hasTargets(profileId, type) {
    // Check if targets file exists and has content
    // This would be implemented based on your existing target file structure
    return true; // Placeholder
  }

  randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  }

  // Database methods
  async getRunnerState(profileId) {
    const statePath = path.join(__dirname, 'data', 'runner_state.json');
    try {
      const states = JSON.parse(await fs.readFile(statePath, 'utf8'));
      return states.find(s => s.profileId === profileId);
    } catch {
      return null;
    }
  }

  async updateRunnerState(profileId, updates) {
    const statePath = path.join(__dirname, 'data', 'runner_state.json');
    let states = [];
    
    try {
      states = JSON.parse(await fs.readFile(statePath, 'utf8'));
    } catch {
      // File doesn't exist, create new
    }
    
    const existingIndex = states.findIndex(s => s.profileId === profileId);
    const existingState = existingIndex >= 0 ? states[existingIndex] : {};
    
    const newState = {
      ...existingState,
      profileId,
      pod: this.podName,
      ...updates
    };
    
    if (existingIndex >= 0) {
      states[existingIndex] = newState;
    } else {
      states.push(newState);
    }
    
    await fs.writeFile(statePath, JSON.stringify(states, null, 2), 'utf8');
  }

  async initializeAccountState(profileId) {
    const now = new Date();
    const jitterMs = this.generateHandoffJitter();
    const initialDelay = new Date(now.getTime() + jitterMs);
    
    await this.updateRunnerState(profileId, {
      pod: this.podName,
      timezone: 'UTC', // Default, can be made configurable
      sleepWindow: { start: "01:00", end: "07:30" },
      moodSeed: Math.floor(Math.random() * 1000000),
      lastActiveAt: null,
      startsToday: 0,
      energy: 100,
      nextEligibleAt: initialDelay.toISOString(),
      storiesLastAt: null,
      flags: { running: false, needsRecovery: false, paused: false },
      cursors: { targetsFile: '', index: 0 },
      errorStreak: 0,
      pausedUntil: null,
      notes: ''
    });
  }

  async logEvent(profileId, event, type, params, sessionId, outcome, durMs) {
    const eventData = {
      ts: new Date().toISOString(),
      pod: this.podName,
      profileId,
      sessionId: sessionId || null,
      event,
      type,
      params: params || {},
      outcome: outcome || null,
      durMs: durMs || null
    };
    
    const eventsPath = path.join(__dirname, 'data', 'runner_events.json');
    let events = [];
    
    try {
      events = JSON.parse(await fs.readFile(eventsPath, 'utf8'));
    } catch {
      // File doesn't exist, create new
    }
    
    events.push(eventData);
    await fs.writeFile(eventsPath, JSON.stringify(events, null, 2), 'utf8');
    
    // Also log to console
    console.log(`📝 Event: ${event} | ${profileId} | ${type} | ${outcome || 'N/A'}`);
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    console.log('🛑 Stopping Smart Runner...');
    this.isRunning = false;
    
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    
    // Kill current session if running
    if (this.currentSession) {
      console.log('🛑 Terminating current session...');
      // Child process cleanup would go here
    }
    
    console.log('✅ Smart Runner stopped');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const podIndex = args.indexOf('--pod');
  
  if (podIndex === -1 || podIndex === args.length - 1) {
    console.error('❌ Usage: smart-runner --pod <podName>');
    process.exit(1);
  }
  
  const podName = args[podIndex + 1];
  const runner = new SmartRunner(podName);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    await runner.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    await runner.stop();
    process.exit(0);
  });
  
  try {
    await runner.initialize();
    await runner.start();
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = SmartRunner;
