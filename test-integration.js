const { watchStories } = require('./humanize/scripts/watchStories.js');

// Test configuration
const TEST_DURATION = 150; // 2.5 minutes
const TEST_PROFILE = 'test-integration-profile';

console.log('🧪 Integration Test: Advanced Tap System');
console.log(`📱 Profile: ${TEST_PROFILE}`);
console.log(`⏱️  Duration: ${TEST_DURATION} seconds`);
console.log(`🎯 Target: Test advanced tap system in live Instagram session`);

// Mock page object for testing
const mockPage = {
  target: () => ({
    createCDPSession: async () => ({
      send: async () => {},
      detach: async () => {}
    })
  }),
  url: () => 'https://www.instagram.com/stories/test/',
  title: () => 'Stories • Instagram',
  viewport: () => ({ width: 394, height: 852, isMobile: true })
};

// Mock navigation functions
global.navigateToStories = async () => ({ success: true, stories: 5 });
global.isStoryActive = async () => true;
global.storyTapNext = async () => ({ success: true });
global.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

console.log('\n🚀 Starting integration test...');
console.log('📊 This will run for ~2.5 minutes to collect tap statistics...');

// Start the test
const startTime = Date.now();
watchStories(mockPage, TEST_DURATION, TEST_PROFILE)
  .then(result => {
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log('\n✅ Integration test completed!');
    console.log(`⏱️  Actual duration: ${duration}s`);
    console.log(`📊 Result:`, result);
  })
  .catch(error => {
    console.error('\n❌ Integration test failed:', error.message);
  });

