#!/usr/bin/env node

const DailySessionOrchestrator = require('./modules/DailySessionOrchestrator');
const HomeFeedScroller = require('./modules/HomeFeedScroller');
const SessionMemory = require('./modules/SessionMemory');
const path = require('path');

class IntegrationTester {
  constructor() {
    this.configPath = path.join(__dirname, 'config');
    this.dataPath = path.join(__dirname, 'data');
    this.orchestrator = null;
    this.homeFeedScroller = null;
    this.sessionMemory = null;
  }

  async initialize() {
    this.orchestrator = new DailySessionOrchestrator(this.configPath);
    this.homeFeedScroller = new HomeFeedScroller(this.configPath, this.dataPath);
    this.sessionMemory = new SessionMemory(this.dataPath);
    
    await Promise.all([
      this.orchestrator.initialize(),
      this.homeFeedScroller.initialize(),
      this.sessionMemory.initialize()
    ]);
    
    console.log('🧪 Integration Tester initialized');
  }

  async testEndToEndSession() {
    console.log('\n🔄 Testing End-to-End Session Flow...');
    
    const testProfileId = 'integration_test_profile';
    const testState = {
      profileId: testProfileId,
      lastActiveAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      likesToday: 20,
      accountAge: 180,
      recentBlocks: 0,
      sessionsToday: 1
    };
    
    console.log('Step 1: Checking if session should run...');
    const shouldRun = await this.orchestrator.shouldRunSession(testProfileId, testState, this.sessionMemory);
    console.log(`Should run: ${shouldRun.shouldRun} (${shouldRun.reason})`);
    
    if (!shouldRun.shouldRun) {
      console.log('❌ Session gating failed, skipping end-to-end test');
      return;
    }
    
    console.log('\nStep 2: Selecting session shape...');
    const shapeSelection = this.orchestrator.selectSessionShape(testProfileId, testState, this.sessionMemory);
    console.log(`Selected shape: ${shapeSelection.shape} (${shapeSelection.reason})`);
    
    console.log('\nStep 3: Calculating session parameters...');
    const sessionParams = this.orchestrator.calculateSessionParams(
      shapeSelection.shape,
      'Casual',
      testState,
      this.sessionMemory
    );
    console.log(`Session params:`, {
      duration: `${Math.round(sessionParams.duration / 1000)}s`,
      likeCaps: sessionParams.likeCaps,
      riskTier: sessionParams.riskTier
    });
    
    console.log('\nStep 4: Simulating session execution...');
    // This would normally execute the actual homefeed scroller
    // For testing, we'll just verify the parameters are valid
    const isValidSession = this.validateSessionParams(sessionParams);
    console.log(`Session parameters valid: ${isValidSession ? '✅' : '❌'}`);
    
    console.log('\nStep 5: Updating session memory...');
    this.sessionMemory.updateLastSession(testProfileId, {
      shape: shapeSelection.shape,
      mood: 'Casual',
      startTs: new Date().toISOString(),
      endTs: new Date().toISOString(),
      likes: 5,
      reasonEnded: 'timeLimit',
      duration: sessionParams.duration,
      scarcity: false,
      riskTier: sessionParams.riskTier
    });
    
    this.sessionMemory.updateDailyCounters(testProfileId, {
      sessions: 1,
      likes: 5,
      comments: 2,
      profileHops: 1
    });
    
    // Save memory to persist changes
    await this.sessionMemory.saveMemory();
    
    console.log('✅ End-to-end session flow completed');
  }

  validateSessionParams(params) {
    const requiredFields = ['shape', 'mood', 'duration', 'likeCaps', 'actions', 'exitConditions'];
    
    for (const field of requiredFields) {
      if (!params[field]) {
        console.log(`❌ Missing required field: ${field}`);
        return false;
      }
    }
    
    // Validate duration (allow shorter durations for MicroCheck)
    if (params.duration < 1000 || params.duration > 720000) { // 1s to 12min
      console.log(`❌ Invalid duration: ${params.duration}ms`);
      return false;
    }
    
    // Validate like caps
    if (!params.likeCaps.followed || !params.likeCaps.suggested || !params.likeCaps.maxPerSession) {
      console.log(`❌ Invalid like caps structure`);
      return false;
    }
    
    return true;
  }

  async testCrossSessionMemory() {
    console.log('\n🧠 Testing Cross-Session Memory...');
    
    const testProfileId = `memory_test_profile_${Date.now()}`;
    
    // Clear any existing memory for this test profile
    this.sessionMemory.memory.profiles[testProfileId] = {
      lastSeenIds: [],
      likeWindow: [],
      likeToday: 0,
      lastSession: null,
      familiarAccounts: [],
      scarcityObservations: [],
      dailyCounters: { sessions: 0, likes: 0, comments: 0, profileHops: 0 },
      entryVariations: []
    };
    
    // Simulate multiple sessions
    const sessions = [
      { shape: 'CasualSkim', mood: 'Casual', likes: 8 },
      { shape: 'DeepRead', mood: 'DeepDive', likes: 6 },
      { shape: 'MicroCheck', mood: 'DoNotDisturb', likes: 2 }
    ];
    
    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      console.log(`\nSession ${i + 1}: ${session.shape} + ${session.mood}`);
      
      // Update session memory
      this.sessionMemory.updateLastSession(testProfileId, {
        shape: session.shape,
        mood: session.mood,
        startTs: new Date(Date.now() - (sessions.length - i) * 60 * 60 * 1000).toISOString(),
        endTs: new Date(Date.now() - (sessions.length - i - 1) * 60 * 60 * 1000).toISOString(),
        likes: session.likes,
        reasonEnded: 'timeLimit',
        duration: 300000,
        scarcity: false,
        riskTier: 'Seasoned'
      });
      
      // Add some likes to window
      for (let j = 0; j < session.likes; j++) {
        this.sessionMemory.addLikeToWindow(testProfileId, `post_${i}_${j}`, 'followed');
      }
      
      // Add familiar accounts
      this.sessionMemory.addFamiliarAccount(testProfileId, `user_${i}`, 'like');
      
      // Update daily counters for each session
      this.sessionMemory.updateDailyCounters(testProfileId, {
        sessions: 1, // Add 1 session each time
        likes: session.likes,
        comments: Math.floor(session.likes * 0.3),
        profileHops: Math.floor(session.likes * 0.2)
      });
    }
    
    // Save memory to persist all changes
    await this.sessionMemory.saveMemory();
    
    // Test memory retrieval
    const lastSession = this.sessionMemory.getLastSession(testProfileId);
    const likeWindow = this.sessionMemory.getLikeWindow(testProfileId);
    const familiarAccounts = this.sessionMemory.getFamiliarAccounts(testProfileId);
    const dailyCounters = this.sessionMemory.getDailyCounters(testProfileId);
    
    console.log(`\nMemory retrieval test:`);
    console.log(`Last session shape: ${lastSession?.shape} (expected: MicroCheck)`);
    console.log(`Like window size: ${likeWindow.length} (expected: 5 - window size)`);
    console.log(`Familiar accounts: ${familiarAccounts.length} (expected: 3)`);
    console.log(`Daily sessions: ${dailyCounters.sessions} (expected: 3)`);
    
    const memoryValid = lastSession?.shape === 'MicroCheck' && 
                       likeWindow.length === 5 && 
                       familiarAccounts.length === 3 && 
                       dailyCounters.sessions === 3;
    
    console.log(`Memory test: ${memoryValid ? '✅ PASS' : '❌ FAIL'}`);
  }

  async testScarcityDetection() {
    console.log('\n📊 Testing Scarcity Detection...');
    
    const testProfileId = 'scarcity_test_profile';
    
    // Test normal feed (not scarce) - add 3 observations for average
    this.sessionMemory.addScarcityObservation(testProfileId, {
      followedRatio: 0.7,
      suggestedRatio: 0.2,
      adRatio: 0.1,
      totalPosts: 20
    });
    this.sessionMemory.addScarcityObservation(testProfileId, {
      followedRatio: 0.6,
      suggestedRatio: 0.3,
      adRatio: 0.1,
      totalPosts: 20
    });
    this.sessionMemory.addScarcityObservation(testProfileId, {
      followedRatio: 0.8,
      suggestedRatio: 0.1,
      adRatio: 0.1,
      totalPosts: 20
    });
    
    const normalScarcity = this.orchestrator.detectScarcity(
      this.sessionMemory.getScarcityObservations(testProfileId)
    );
    console.log(`Normal feed scarcity: ${normalScarcity} (expected: false)`);
    
    // Clear observations and test scarce feed
    this.sessionMemory.memory.profiles[testProfileId].scarcityObservations = [];
    
    // Test scarce feed - add 3 observations for average
    this.sessionMemory.addScarcityObservation(testProfileId, {
      followedRatio: 0.3,
      suggestedRatio: 0.6,
      adRatio: 0.1,
      totalPosts: 20
    });
    this.sessionMemory.addScarcityObservation(testProfileId, {
      followedRatio: 0.2,
      suggestedRatio: 0.7,
      adRatio: 0.1,
      totalPosts: 20
    });
    this.sessionMemory.addScarcityObservation(testProfileId, {
      followedRatio: 0.4,
      suggestedRatio: 0.5,
      adRatio: 0.1,
      totalPosts: 20
    });
    
    const scarceScarcity = this.orchestrator.detectScarcity(
      this.sessionMemory.getScarcityObservations(testProfileId)
    );
    console.log(`Scarce feed scarcity: ${scarceScarcity} (expected: true)`);
    
    const scarcityTestPassed = !normalScarcity && scarceScarcity;
    console.log(`Scarcity detection: ${scarcityTestPassed ? '✅ PASS' : '❌ FAIL'}`);
  }

  async testSessionShapeVariety() {
    console.log('\n🎭 Testing Session Shape Variety...');
    
    const testProfileId = 'variety_test_profile';
    const testState = {
      profileId: testProfileId,
      lastActiveAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      likesToday: 20,
      accountAge: 180,
      recentBlocks: 0
    };
    
    // Test multiple shape selections to ensure variety
    const shapeCounts = {};
    const iterations = 100;
    
    for (let i = 0; i < iterations; i++) {
      const shapeSelection = this.orchestrator.selectSessionShape(testProfileId, testState, this.sessionMemory);
      shapeCounts[shapeSelection.shape] = (shapeCounts[shapeSelection.shape] || 0) + 1;
    }
    
    console.log(`Shape distribution over ${iterations} iterations:`);
    for (const [shape, count] of Object.entries(shapeCounts)) {
      const percentage = (count / iterations * 100).toFixed(1);
      console.log(`  ${shape}: ${count} (${percentage}%)`);
    }
    
    // Check that we have reasonable variety (no single shape dominates)
    const maxCount = Math.max(...Object.values(shapeCounts));
    const varietyGood = maxCount < iterations * 0.6; // No shape should be >60%
    
    console.log(`Shape variety test: ${varietyGood ? '✅ PASS' : '❌ FAIL'}`);
  }

  async testDailyBudgeting() {
    console.log('\n💰 Testing Daily Budgeting...');
    
    const testProfileId = 'budget_test_profile';
    const testState = {
      profileId: testProfileId,
      accountAge: 180,
      recentBlocks: 0
    };
    
    // Test different daily like counts
    const testCases = [
      { likesToday: 10, shouldRun: true },
      { likesToday: 50, shouldRun: true },
      { likesToday: 100, shouldRun: true },
      { likesToday: 180, shouldRun: false }, // 90% of 200 budget
      { likesToday: 200, shouldRun: false }  // 100% of budget
    ];
    
    for (const testCase of testCases) {
      const state = { ...testState, likesToday: testCase.likesToday };
      const budgetCheck = this.orchestrator.checkDailyBudget(state);
      const shouldRun = !budgetCheck;
      
      console.log(`Likes today: ${testCase.likesToday}, Should run: ${shouldRun} (expected: ${testCase.shouldRun})`);
    }
    
    console.log('✅ Daily budgeting test completed');
  }

  async runAllTests() {
    try {
      await this.initialize();
      
      await this.testEndToEndSession();
      await this.testCrossSessionMemory();
      await this.testScarcityDetection();
      await this.testSessionShapeVariety();
      await this.testDailyBudgeting();
      
      console.log('\n🎉 All integration tests completed!');
      
    } catch (error) {
      console.error('❌ Integration test suite failed:', error.message);
      process.exit(1);
    }
  }
}

// CLI interface
async function main() {
  const tester = new IntegrationTester();
  await tester.runAllTests();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = IntegrationTester;
