const { StorySession, generateRandomizedTapPosition } = require('./humanize/scripts/watchStories.js');

// Mock viewport for testing
const mockViewport = { w: 394, h: 852 };

// Seed the random number generator for deterministic testing
const seed = 'test-profile-' + new Date().toISOString().split('T')[0];
Math.seedrandom = require('seedrandom');
Math.seedrandom(seed);

// Create a mock session
const session = new StorySession('test-profile', 60);

// Test the advanced tap system
console.log('🧪 Testing Advanced Tap System');
console.log(`📱 Viewport: ${mockViewport.w}x${mockViewport.h}`);
console.log(`🎯 Session: ${session.accountId}`);
console.log(`🔢 Seed: ${seed}`);

// Initialize the tap profile
session.initializeRightTapProfile();

console.log('\n📊 Session Tap Profile:');
console.log(`   Anchor: (${session.rightTapProfile.anchor.x.toFixed(3)}, ${session.rightTapProfile.anchor.y.toFixed(3)})`);
console.log(`   Weights: Base=${session.rightTapProfile.weights.base.toFixed(3)}, Wide=${session.rightTapProfile.weights.wide.toFixed(3)}, Rare=${session.rightTapProfile.weights.rare.toFixed(3)}`);
console.log(`   Stickiness: ${session.rightTapProfile.stickiness.toFixed(3)}`);
console.log(`   Look Pause Chance: ${session.rightTapProfile.lookPauseChance.toFixed(4)}`);

// Collect 1,000 taps
const taps = [];
const categories = { base: 0, wide: 0, rare: 0 };
const coordinates = new Map();
const xHistogram = new Array(20).fill(0); // 20 buckets for x (% of width)
const yHistogram = new Array(20).fill(0); // 20 buckets for y (% of height)

console.log('\n🔄 Generating 1,000 taps...');

for (let i = 0; i < 1000; i++) {
  const tap = generateRandomizedTapPosition(mockViewport, 1, session);
  taps.push(tap);
  
  // Count categories
  categories[tap.category]++;
  
  // Count coordinates
  const coordKey = `${tap.x},${tap.y}`;
  coordinates.set(coordKey, (coordinates.get(coordKey) || 0) + 1);
  
  // Update histograms
  const xPercent = tap.x / mockViewport.w;
  const yPercent = tap.y / mockViewport.h;
  const xBucket = Math.floor(xPercent * 20);
  const yBucket = Math.floor(yPercent * 20);
  if (xBucket >= 0 && xBucket < 20) xHistogram[xBucket]++;
  if (yBucket >= 0 && yBucket < 20) yHistogram[yBucket]++;
  
  // Progress indicator
  if ((i + 1) % 100 === 0) {
    process.stdout.write(`\r   Progress: ${i + 1}/1000`);
  }
}

console.log('\n\n📈 RESULTS:');

// Category distribution
console.log('\n🎯 Category Distribution:');
console.log(`   Base: ${categories.base} (${(categories.base/1000*100).toFixed(1)}%)`);
console.log(`   Wide: ${categories.wide} (${(categories.wide/1000*100).toFixed(1)}%)`);
console.log(`   Rare: ${categories.rare} (${(categories.rare/1000*100).toFixed(1)}%)`);

// Top 10 pixel coordinates
console.log('\n🏆 Top 10 Pixel Coordinates:');
const sortedCoords = Array.from(coordinates.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

sortedCoords.forEach(([coord, count], index) => {
  const [x, y] = coord.split(',').map(Number);
  const percent = (count/1000*100).toFixed(2);
  console.log(`   ${index + 1}. (${x}, ${y}): ${count} taps (${percent}%)`);
});

// Min/max coordinates
const minX = Math.min(...taps.map(t => t.x));
const maxX = Math.max(...taps.map(t => t.x));
const minY = Math.min(...taps.map(t => t.y));
const maxY = Math.max(...taps.map(t => t.y));

console.log('\n📏 Coordinate Ranges:');
console.log(`   X: ${minX} to ${maxX} (${(minX/mockViewport.w*100).toFixed(1)}% to ${(maxX/mockViewport.w*100).toFixed(1)}% of width)`);
console.log(`   Y: ${minY} to ${maxY} (${(minY/mockViewport.h*100).toFixed(1)}% to ${(maxY/mockViewport.h*100).toFixed(1)}% of height)`);

// Check exclusion zones
const config = require('./humanize/scripts/watchStories.js').SC_CONFIG.rightTap;
const exclusionViolations = taps.filter(tap => {
  const xPercent = tap.x / mockViewport.w;
  const yPercent = tap.y / mockViewport.h;
  return yPercent < config.safety.top || 
         yPercent > config.safety.bottom || 
         xPercent > config.safety.right;
});

console.log('\n🚫 Exclusion Zone Violations:');
if (exclusionViolations.length === 0) {
  console.log('   ✅ None - all taps within safe zones');
} else {
  console.log(`   ❌ ${exclusionViolations.length} violations found!`);
  exclusionViolations.slice(0, 5).forEach(tap => {
    const xPercent = tap.x / mockViewport.w;
    const yPercent = tap.y / mockViewport.h;
    console.log(`      (${tap.x}, ${tap.y}) -> x:${(xPercent*100).toFixed(1)}%, y:${(yPercent*100).toFixed(1)}%`);
  });
}

// Histograms
console.log('\n📊 X-Axis Histogram (% of width):');
xHistogram.forEach((count, bucket) => {
  const range = `${(bucket*5).toFixed(0)}-${((bucket+1)*5).toFixed(0)}%`;
  const percent = (count/1000*100).toFixed(1);
  const bars = '█'.repeat(Math.floor(count/10));
  console.log(`   ${range.padStart(6)}: ${count.toString().padStart(3)} (${percent.padStart(4)}%) ${bars}`);
});

console.log('\n📊 Y-Axis Histogram (% of height):');
yHistogram.forEach((count, bucket) => {
  const range = `${(bucket*5).toFixed(0)}-${((bucket+1)*5).toFixed(0)}%`;
  const percent = (count/1000*100).toFixed(1);
  const bars = '█'.repeat(Math.floor(count/10));
  console.log(`   ${range.padStart(6)}: ${count.toString().padStart(3)} (${percent.padStart(4)}%) ${bars}`);
});

// Last tap drift analysis
console.log('\n🔄 Last Tap Drift Analysis:');
let consecutiveRepeats = 0;
let minDistanceViolations = 0;

for (let i = 1; i < taps.length; i++) {
  const prev = taps[i-1];
  const curr = taps[i];
  const distance = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2);
  
  if (distance === 0) consecutiveRepeats++;
  if (distance < config.antiRobot.minDistance) minDistanceViolations++;
}

console.log(`   Consecutive repeats: ${consecutiveRepeats} (${(consecutiveRepeats/999*100).toFixed(1)}%)`);
console.log(`   Min distance violations: ${minDistanceViolations} (${(minDistanceViolations/999*100).toFixed(1)}%)`);

// Session weights confirmation
console.log('\n⚖️ Session Weights Confirmation:');
console.log(`   Base weight (wb): ${session.rightTapProfile.weights.base.toFixed(3)}`);
console.log(`   Wide weight (ww): ${session.rightTapProfile.weights.wide.toFixed(3)}`);
console.log(`   Rare weight (wr): ${session.rightTapProfile.weights.rare.toFixed(3)}`);
console.log(`   Sum: ${(session.rightTapProfile.weights.base + session.rightTapProfile.weights.wide + session.rightTapProfile.weights.rare).toFixed(6)}`);

// Export results
const results = {
  session: {
    profileId: session.accountId,
    seed: seed,
    anchor: session.rightTapProfile.anchor,
    weights: session.rightTapProfile.weights,
    stickiness: session.rightTapProfile.stickiness,
    lookPauseChance: session.rightTapProfile.lookPauseChance
  },
  viewport: mockViewport,
  taps: {
    total: 1000,
    categories: categories,
    coordinateFrequencies: Object.fromEntries(sortedCoords),
    ranges: { minX, maxX, minY, maxY },
    exclusionViolations: exclusionViolations.length,
    consecutiveRepeats,
    minDistanceViolations
  },
  histograms: {
    x: xHistogram,
    y: yHistogram
  }
};

require('fs').writeFileSync('tap-test-results.json', JSON.stringify(results, null, 2));
console.log('\n💾 Results exported to tap-test-results.json');

console.log('\n✅ Self-test completed!');
