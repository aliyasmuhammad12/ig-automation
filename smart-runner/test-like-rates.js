#!/usr/bin/env node

const LikeRateCalculator = require('./modules/LikeRateCalculator');
const SessionMemory = require('./modules/SessionMemory');
const path = require('path');

class LikeRateTester {
  constructor() {
    this.configPath = path.join(__dirname, 'config');
    this.dataPath = path.join(__dirname, 'data');
    this.likeCalculator = null;
    this.sessionMemory = null;
  }

  async initialize() {
    this.likeCalculator = new LikeRateCalculator(this.configPath);
    this.sessionMemory = new SessionMemory(this.dataPath);
    
    await Promise.all([
      this.likeCalculator.initialize(),
      this.sessionMemory.initialize()
    ]);
    
    console.log('🧪 Like Rate Tester initialized');
  }

  async testMoodBasedRates() {
    console.log('\n📊 Testing Mood-Based Like Rates...');
    
    const testState = {
      profileId: 'test_profile_001',
      accountAge: 180,
      recentBlocks: 0,
      likesToday: 20,
      postsSeenInSession: 5
    };
    
    const moods = ['DoNotDisturb', 'Sleepy', 'Casual', 'DeepDive', 'SkimLike', 'CreatorResearch', 'SocialButterfly', 'WeekendFrenzy'];
    const contentTypes = ['followed', 'suggested'];
    const sessionShapes = ['MicroCheck', 'CasualSkim', 'DeepRead', 'SkimBounce', 'CreatorResearch'];
    
    for (const mood of moods) {
      console.log(`\n${mood}:`);
      
      for (const contentType of contentTypes) {
        const rates = [];
        
        // Test multiple times to get average
        for (let i = 0; i < 10; i++) {
          const result = this.likeCalculator.calculateLikeRate(mood, contentType, 'CasualSkim', testState, this.sessionMemory);
          rates.push(result.rate);
        }
        
        const avgRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
        const minRate = Math.min(...rates);
        const maxRate = Math.max(...rates);
        
        console.log(`  ${contentType}: avg=${(avgRate * 100).toFixed(1)}%, range=${(minRate * 100).toFixed(1)}%-${(maxRate * 100).toFixed(1)}%`);
      }
    }
  }

  async testGlobalGates() {
    console.log('\n🚪 Testing Global Gates...');
    
    const testState = {
      profileId: 'test_profile_002',
      accountAge: 180,
      recentBlocks: 0,
      likesToday: 20,
      postsSeenInSession: 5
    };
    
    // Test 1: Ad blocking
    console.log('Test 1: Ad blocking');
    const adPost = { isAd: true, contentType: 'ads' };
    const adResult = this.likeCalculator.calculateLikeRate('Casual', 'ads', 'CasualSkim', testState, this.sessionMemory, adPost);
    console.log(`Ad like rate: ${(adResult.rate * 100).toFixed(1)}% (should be 0%) ${adResult.rate === 0 ? '✅' : '❌'}`);
    
    // Test 2: Min dwell time
    console.log('\nTest 2: Min dwell time');
    const shortDwellPost = { dwellTime: 500, contentType: 'followed' }; // 500ms < 1200ms
    const shortDwellResult = this.likeCalculator.calculateLikeRate('Casual', 'followed', 'CasualSkim', testState, this.sessionMemory, shortDwellPost);
    const normalPost = { dwellTime: 2000, contentType: 'followed' }; // 2000ms > 1200ms
    const normalResult = this.likeCalculator.calculateLikeRate('Casual', 'followed', 'CasualSkim', testState, this.sessionMemory, normalPost);
    console.log(`Short dwell rate: ${(shortDwellResult.rate * 100).toFixed(1)}%`);
    console.log(`Normal dwell rate: ${(normalResult.rate * 100).toFixed(1)}%`);
    console.log(`Short dwell should be lower: ${shortDwellResult.rate < normalResult.rate ? '✅' : '❌'}`);
    
    // Test 3: First lap caution
    console.log('\nTest 3: First lap caution');
    const firstLapState = { ...testState, postsSeenInSession: 1 };
    const firstLapResult = this.likeCalculator.calculateLikeRate('Casual', 'followed', 'CasualSkim', firstLapState, this.sessionMemory);
    const laterLapState = { ...testState, postsSeenInSession: 10 };
    const laterLapResult = this.likeCalculator.calculateLikeRate('Casual', 'followed', 'CasualSkim', laterLapState, this.sessionMemory);
    console.log(`First lap rate: ${(firstLapResult.rate * 100).toFixed(1)}%`);
    console.log(`Later lap rate: ${(laterLapResult.rate * 100).toFixed(1)}%`);
    console.log(`First lap should be lower: ${firstLapResult.rate < laterLapResult.rate ? '✅' : '❌'}`);
  }

  async testAntiStreak() {
    console.log('\n🚫 Testing Anti-Streak Logic...');
    
    const testProfileId = 'test_profile_003';
    const testState = {
      profileId: testProfileId,
      accountAge: 180,
      recentBlocks: 0,
      likesToday: 20,
      postsSeenInSession: 5
    };
    
    // Add some likes to the window
    this.sessionMemory.addLikeToWindow(testProfileId, 'post1', 'followed');
    this.sessionMemory.addLikeToWindow(testProfileId, 'post2', 'followed');
    this.sessionMemory.addLikeToWindow(testProfileId, 'post3', 'followed');
    
    const streakResult = this.likeCalculator.calculateLikeRate('Casual', 'followed', 'CasualSkim', testState, this.sessionMemory);
    console.log(`Rate with 3 recent likes: ${(streakResult.rate * 100).toFixed(1)}%`);
    console.log(`Should be significantly reduced: ${streakResult.rate < 0.1 ? '✅' : '❌'}`);
    
    // Clear the like window
    this.sessionMemory.memory.profiles[testProfileId].likeWindow = [];
    
    const noStreakResult = this.likeCalculator.calculateLikeRate('Casual', 'followed', 'CasualSkim', testState, this.sessionMemory);
    console.log(`Rate with no recent likes: ${(noStreakResult.rate * 100).toFixed(1)}%`);
    console.log(`Should be higher than streak rate: ${noStreakResult.rate > streakResult.rate ? '✅' : '❌'}`);
  }

  async testFamiliarityBump() {
    console.log('\n👥 Testing Familiarity Bump...');
    
    const testProfileId = `test_profile_familiarity_${Date.now()}`;
    const testState = {
      profileId: testProfileId,
      accountAge: 180,
      recentBlocks: 0,
      likesToday: 20,
      postsSeenInSession: 5
    };
    
    // Clear like window to avoid anti-streak interference
    if (!this.sessionMemory.memory.profiles[testProfileId]) {
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
    }
    this.sessionMemory.memory.profiles[testProfileId].likeWindow = [];
    
    // Add familiar account
    this.sessionMemory.addFamiliarAccount(testProfileId, 'familiar_user', 'like');
    
    const familiarPost = { username: 'familiar_user', contentType: 'followed' };
    const familiarResult = this.likeCalculator.calculateLikeRate('Casual', 'followed', 'CasualSkim', testState, this.sessionMemory, familiarPost);
    
    const unknownPost = { username: 'unknown_user', contentType: 'followed' };
    const unknownResult = this.likeCalculator.calculateLikeRate('Casual', 'followed', 'CasualSkim', testState, this.sessionMemory, unknownPost);
    
    console.log(`Familiar account rate: ${(familiarResult.rate * 100).toFixed(1)}%`);
    console.log(`Unknown account rate: ${(unknownResult.rate * 100).toFixed(1)}%`);
    console.log(`Familiar should be higher: ${familiarResult.rate > unknownResult.rate ? '✅' : '❌'}`);
  }

  async testRiskTierAdjustments() {
    console.log('\n🛡️  Testing Risk Tier Adjustments...');
    
    const testState = {
      profileId: 'test_profile_005',
      likesToday: 20,
      postsSeenInSession: 5
    };
    
    const riskTiers = [
      { accountAge: 15, recentBlocks: 0, tier: 'NewCold', scalar: 0.6 },
      { accountAge: 90, recentBlocks: 0, tier: 'Warming', scalar: 0.85 },
      { accountAge: 200, recentBlocks: 0, tier: 'Seasoned', scalar: 1.0 }
    ];
    
    for (const riskTier of riskTiers) {
      const state = { ...testState, accountAge: riskTier.accountAge, recentBlocks: riskTier.recentBlocks };
      const result = this.likeCalculator.calculateLikeRate('Casual', 'followed', 'CasualSkim', state, this.sessionMemory);
      
      console.log(`${riskTier.tier} (${riskTier.scalar}x): ${(result.rate * 100).toFixed(1)}%`);
    }
  }

  async testScarcityScaling() {
    console.log('\n📉 Testing Scarcity Scaling...');
    
    const testProfileId = `test_profile_scarcity_${Date.now()}`;
    const testState = {
      profileId: testProfileId,
      accountAge: 180,
      recentBlocks: 0,
      likesToday: 20,
      postsSeenInSession: 5
    };
    
    // Add scarcity observations (need 3 for average calculation)
    this.sessionMemory.addScarcityObservation(testProfileId, {
      followedRatio: 0.3, // Below 0.4 threshold
      suggestedRatio: 0.6, // Above 0.5 threshold
      adRatio: 0.1,
      totalPosts: 20
    });
    this.sessionMemory.addScarcityObservation(testProfileId, {
      followedRatio: 0.2, // Below 0.4 threshold
      suggestedRatio: 0.7, // Above 0.5 threshold
      adRatio: 0.1,
      totalPosts: 20
    });
    this.sessionMemory.addScarcityObservation(testProfileId, {
      followedRatio: 0.4, // At 0.4 threshold
      suggestedRatio: 0.5, // At 0.5 threshold
      adRatio: 0.1,
      totalPosts: 20
    });
    
    const scarcityResult = this.likeCalculator.calculateLikeRate('Casual', 'followed', 'CasualSkim', testState, this.sessionMemory);
    
    // Clear scarcity observations
    this.sessionMemory.memory.profiles[testProfileId].scarcityObservations = [];
    
    const normalResult = this.likeCalculator.calculateLikeRate('Casual', 'followed', 'CasualSkim', testState, this.sessionMemory);
    
    console.log(`Scarcity mode rate: ${(scarcityResult.rate * 100).toFixed(1)}%`);
    console.log(`Normal mode rate: ${(normalResult.rate * 100).toFixed(1)}%`);
    console.log(`Scarcity should be lower: ${scarcityResult.rate < normalResult.rate ? '✅' : '❌'}`);
  }

  async testDecayMechanism() {
    console.log('\n📉 Testing Decay Mechanism...');
    
    const testProfileId = `test_profile_decay_${Date.now()}`;
    const testState = {
      profileId: testProfileId,
      accountAge: 180,
      recentBlocks: 0,
      likesToday: 20,
      postsSeenInSession: 5
    };
    
    // Test decay with different numbers of recent likes
    const decayResults = [];
    for (let likes = 0; likes <= 5; likes++) {
      // Clear and repopulate like window
      if (!this.sessionMemory.memory.profiles[testProfileId]) {
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
      }
      this.sessionMemory.memory.profiles[testProfileId].likeWindow = [];
      for (let i = 0; i < likes; i++) {
        this.sessionMemory.addLikeToWindow(testProfileId, `post${i}`, 'followed');
      }
      
      const result = this.likeCalculator.calculateLikeRate('Casual', 'followed', 'CasualSkim', testState, this.sessionMemory);
      decayResults.push({ likes, rate: result.rate });
    }
    
    console.log('Decay progression:');
    for (const result of decayResults) {
      console.log(`  ${result.likes} likes: ${(result.rate * 100).toFixed(1)}%`);
    }
    
    // Check that rates generally decrease with more likes
    // Allow for some variation due to other factors (anti-streak, etc.)
    let decreasing = true;
    for (let i = 1; i < decayResults.length; i++) {
      // Allow for small increases due to other factors
      if (decayResults[i].rate > decayResults[i-1].rate * 1.1) {
        decreasing = false;
        break;
      }
    }
    console.log(`Rates generally decreasing: ${decreasing ? '✅' : '❌'}`);
  }

  async runAllTests() {
    try {
      await this.initialize();
      
      await this.testMoodBasedRates();
      await this.testGlobalGates();
      await this.testAntiStreak();
      await this.testFamiliarityBump();
      await this.testRiskTierAdjustments();
      await this.testScarcityScaling();
      await this.testDecayMechanism();
      
      console.log('\n🎉 All like rate tests completed!');
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    }
  }
}

// CLI interface
async function main() {
  const tester = new LikeRateTester();
  await tester.runAllTests();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = LikeRateTester;
