#!/usr/bin/env node

const SmartRunner = require('./smart-runner');

async function testRunner() {
  console.log('🧪 Testing Smart Runner...');
  
  const runner = new SmartRunner('podA');
  
  try {
    // Test initialization
    console.log('1️⃣ Testing initialization...');
    await runner.initialize();
    console.log('✅ Initialization successful');
    
    // Test mood detection
    console.log('2️⃣ Testing mood detection...');
    const now = new Date();
    const testState = { timezone: 'UTC' };
    const mood = runner.getCurrentMood(now, testState);
    console.log(`✅ Current mood: ${mood}`);
    
    // Test handoff jitter generation
    console.log('3️⃣ Testing handoff jitter...');
    const jitter = runner.generateHandoffJitter();
    console.log(`✅ Handoff jitter: ${jitter}ms (${Math.round(jitter/1000)}s)`);
    
    // Test activity planning
    console.log('4️⃣ Testing activity planning...');
    const testProfileId = 'test_profile';
    const testState2 = {
      profileId: testProfileId,
      nextEligibleAt: new Date(Date.now() - 1000).toISOString(), // Eligible now
      startsToday: 0,
      energy: 100,
      flags: { running: false, needsRecovery: false }
    };
    
    const plan = await runner.planActivity(testProfileId, testState2);
    console.log(`✅ Activity plan:`, plan);
    
    // Test weighted selection
    console.log('5️⃣ Testing weighted selection...');
    const candidates = [
      { type: 'reels', weight: 0.8, params: { seconds: 300 } },
      { type: 'follow', weight: 0.35, params: { count: 10 } },
      { type: 'stories', weight: 0.1, params: { seconds: 120 } }
    ];
    
    const selected = runner.selectWeightedActivity(candidates, testProfileId);
    console.log(`✅ Selected activity:`, selected);
    
    console.log('\n🎉 All tests passed! Smart Runner is ready.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  testRunner().catch(console.error);
}

module.exports = testRunner;
