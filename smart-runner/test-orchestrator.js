#!/usr/bin/env node

const DailySessionOrchestrator = require('./modules/DailySessionOrchestrator');
const SessionMemory = require('./modules/SessionMemory');
const path = require('path');

class OrchestratorTester {
  constructor() {
    this.configPath = path.join(__dirname, 'config');
    this.dataPath = path.join(__dirname, 'data');
    this.orchestrator = null;
    this.sessionMemory = null;
  }

  async initialize() {
    this.orchestrator = new DailySessionOrchestrator(this.configPath);
    this.sessionMemory = new SessionMemory(this.dataPath);
    
    await Promise.all([
      this.orchestrator.initialize(),
      this.sessionMemory.initialize()
    ]);
    
    console.log('🧪 Orchestrator Tester initialized');
  }

  async testSessionGating() {
    console.log('\n🔍 Testing Session Gating...');
    
    const testProfileId = `test_profile_gating_${Date.now()}`;
    const testState = {
      profileId: testProfileId,
      lastActiveAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      likesToday: 50,
      accountAge: 180,
      recentBlocks: 0
    };
    
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
    
    // Test 1: Should run (sufficient gap)
    console.log('Test 1: Should run with sufficient gap');
    const result1 = await this.orchestrator.shouldRunSession(testProfileId, testState, this.sessionMemory);
    console.log(`Result: ${result1.shouldRun ? '✅ PASS' : '❌ FAIL'} - ${result1.reason}`);
    
    // Test 2: Should not run (insufficient gap)
    console.log('Test 2: Should not run with insufficient gap');
    const testState2 = {
      ...testState,
      lastActiveAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() // 30 minutes ago
    };
    const result2 = await this.orchestrator.shouldRunSession(testProfileId, testState2, this.sessionMemory);
    console.log(`Result: ${!result2.shouldRun ? '✅ PASS' : '❌ FAIL'} - ${result2.reason}`);
    
    // Test 3: Should not run (fatigue throttle)
    console.log('Test 3: Should not run due to fatigue throttle');
    const testState3 = {
      ...testState,
      likesToday: 150 // Exceeds 60% of daily budget
    };
    const result3 = await this.orchestrator.shouldRunSession(testProfileId, testState3, this.sessionMemory);
    console.log(`Result: ${!result3.shouldRun ? '✅ PASS' : '❌ FAIL'} - ${result3.reason}`);
  }

  async testSessionShapeSelection() {
    console.log('\n🎭 Testing Session Shape Selection...');
    
    const testProfileId = 'test_profile_002';
    const testState = {
      profileId: testProfileId,
      lastActiveAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      likesToday: 20,
      accountAge: 180,
      recentBlocks: 0
    };
    
    // Test different dayparts
    const dayparts = ['Morning', 'Afternoon', 'Evening', 'LateNight'];
    
    for (const daypart of dayparts) {
      console.log(`\nTesting ${daypart} daypart:`);
      
      // Mock the getCurrentDaypart method
      const originalMethod = this.orchestrator.getCurrentDaypart;
      this.orchestrator.getCurrentDaypart = () => daypart;
      
      const shapeSelection = this.orchestrator.selectSessionShape(testProfileId, testState, this.sessionMemory);
      console.log(`Selected shape: ${shapeSelection.shape} (${shapeSelection.reason})`);
      
      // Restore original method
      this.orchestrator.getCurrentDaypart = originalMethod;
    }
  }

  async testSessionParameters() {
    console.log('\n📊 Testing Session Parameters Calculation...');
    
    const testProfileId = 'test_profile_003';
    const testState = {
      profileId: testProfileId,
      accountAge: 180,
      recentBlocks: 0,
      likesToday: 30
    };
    
    const shapes = ['MicroCheck', 'CasualSkim', 'DeepRead', 'SkimBounce', 'CreatorResearch'];
    const moods = ['Casual', 'DeepDive', 'SkimLike', 'CreatorResearch', 'SocialButterfly'];
    
    for (const shape of shapes) {
      for (const mood of moods) {
        console.log(`\nTesting ${shape} + ${mood}:`);
        
        try {
          const params = this.orchestrator.calculateSessionParams(shape, mood, testState, this.sessionMemory);
          console.log(`Duration: ${Math.round(params.duration / 1000)}s`);
          console.log(`Like caps: Followed ${params.likeCaps.followed.min}-${params.likeCaps.followed.max}, Suggested ${params.likeCaps.suggested.min}-${params.likeCaps.suggested.max}`);
          console.log(`Max per session: ${params.likeCaps.maxPerSession}`);
          console.log(`Risk tier: ${params.riskTier}`);
        } catch (error) {
          console.log(`❌ Error: ${error.message}`);
        }
      }
    }
  }

  async testRiskTierDetermination() {
    console.log('\n🛡️  Testing Risk Tier Determination...');
    
    const testCases = [
      { accountAge: 15, recentBlocks: 0, expected: 'NewCold' },
      { accountAge: 15, recentBlocks: 1, expected: 'NewCold' },
      { accountAge: 90, recentBlocks: 0, expected: 'Warming' },
      { accountAge: 200, recentBlocks: 0, expected: 'Seasoned' },
      { accountAge: 200, recentBlocks: 1, expected: 'NewCold' }
    ];
    
    for (const testCase of testCases) {
      const testState = {
        accountAge: testCase.accountAge,
        recentBlocks: testCase.recentBlocks
      };
      
      const riskTier = this.orchestrator.determineRiskTier(testState);
      const passed = riskTier === testCase.expected;
      
      console.log(`Account age: ${testCase.accountAge}d, Recent blocks: ${testCase.recentBlocks} → ${riskTier} ${passed ? '✅' : '❌'}`);
    }
  }

  async testNoOpRealism() {
    console.log('\n🎲 Testing No-Op Realism...');
    
    const testProfileId = 'test_profile_004';
    const testState = {
      profileId: testProfileId,
      sessionsToday: 0
    };
    
    // Test multiple times to see distribution
    const results = [];
    for (let i = 0; i < 100; i++) {
      const shouldApply = this.orchestrator.shouldApplyNoOpRealism(testState, this.sessionMemory);
      results.push(shouldApply);
    }
    
    const noOpCount = results.filter(r => r).length;
    const noOpRate = noOpCount / results.length;
    
    console.log(`No-op rate over 100 tests: ${(noOpRate * 100).toFixed(1)}%`);
    console.log(`Expected range: 15-25%`);
    console.log(`Result: ${noOpRate >= 0.15 && noOpRate <= 0.25 ? '✅ PASS' : '❌ FAIL'}`);
  }

  async testDailyBudgeting() {
    console.log('\n💰 Testing Daily Budgeting...');
    
    const testCases = [
      { likesToday: 10, accountAge: 15, expected: 'NewCold', budget: 60 },
      { likesToday: 50, accountAge: 90, expected: 'Warming', budget: 120 },
      { likesToday: 100, accountAge: 200, expected: 'Seasoned', budget: 200 }
    ];
    
    for (const testCase of testCases) {
      const testState = {
        likesToday: testCase.likesToday,
        accountAge: testCase.accountAge
      };
      
      const dailyBudget = this.orchestrator.getDailyBudget(testState);
      const budgetCheck = this.orchestrator.checkDailyBudget(testState);
      
      console.log(`Likes today: ${testCase.likesToday}, Account age: ${testCase.accountAge}d`);
      console.log(`Daily budget: ${dailyBudget}, Budget check: ${budgetCheck ? 'EXCEEDED' : 'OK'}`);
      console.log(`Expected tier: ${testCase.expected}, Expected budget: ${testCase.budget}`);
      console.log(`Result: ${dailyBudget === testCase.budget ? '✅ PASS' : '❌ FAIL'}\n`);
    }
  }

  async runAllTests() {
    try {
      await this.initialize();
      
      await this.testSessionGating();
      await this.testSessionShapeSelection();
      await this.testSessionParameters();
      await this.testRiskTierDetermination();
      await this.testNoOpRealism();
      await this.testDailyBudgeting();
      
      console.log('\n🎉 All orchestrator tests completed!');
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    }
  }
}

// CLI interface
async function main() {
  const tester = new OrchestratorTester();
  await tester.runAllTests();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = OrchestratorTester;
