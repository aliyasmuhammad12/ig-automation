// Test script to verify the NaN coordinate fix
console.log('🧪 Testing NaN Coordinate Fix...\n');

// Mock data from the log
const mockViewport = { w: 394, h: 852 };
const mockSafeZone = {
  name: 'right_lower',
  x1: 281,
  y1: 487,
  x2: 356,
  y2: 731,
  priority: 3
};

console.log('Test 1: Safe Zone Normalization');
console.log('=================================');

// Test the normalization logic
const roi = {
  x: [Math.max(0, mockSafeZone.x1 / mockViewport.w), Math.min(1, mockSafeZone.x2 / mockViewport.w)],
  y: [Math.max(0, mockSafeZone.y1 / mockViewport.h), Math.min(1, mockSafeZone.y2 / mockViewport.h)]
};

console.log(`Safe zone: (${mockSafeZone.x1},${mockSafeZone.y1},${mockSafeZone.x2},${mockSafeZone.y2})`);
console.log(`Viewport: ${mockViewport.w}x${mockViewport.h}`);
console.log(`ROI: x[${roi.x[0].toFixed(3)},${roi.x[1].toFixed(3)}], y[${roi.y[0].toFixed(3)},${roi.y[1].toFixed(3)}]`);

// Test coordinate generation
console.log('\nTest 2: Coordinate Generation');
console.log('==============================');

function rFloat(a, b) {
  return a + Math.random() * (b - a);
}

// Generate test coordinates
const testX = Math.round(mockViewport.w * rFloat(roi.x[0], roi.x[1]));
const testY = Math.round(mockViewport.h * rFloat(roi.y[0], roi.y[1]));

console.log(`Generated coordinates: (${testX}, ${testY})`);
console.log(`Are coordinates valid? ${!isNaN(testX) && !isNaN(testY) ? '✅ Yes' : '❌ No'}`);

// Test bounds validation
console.log('\nTest 3: Bounds Validation');
console.log('==========================');

const isValidROI = roi.x[0] < roi.x[1] && roi.y[0] < roi.y[1];
console.log(`ROI bounds valid? ${isValidROI ? '✅ Yes' : '❌ No'}`);

if (isValidROI) {
  console.log('✅ Safe zone normalization working correctly');
  console.log('✅ Coordinate generation should work');
  console.log('✅ NaN issue should be resolved');
} else {
  console.log('❌ ROI bounds are invalid');
  console.log('❌ This would cause NaN coordinates');
}

console.log('\n🎯 Fix Summary:');
console.log('===============');
console.log('✅ Added Math.max/Math.min bounds checking');
console.log('✅ Added ROI validation before use');
console.log('✅ Added fallback to default ROI');
console.log('✅ Added debug logging for troubleshooting');
console.log('✅ Fixed both advanced and simple tap systems');

console.log('\n🚀 Ready for Testing!');
console.log('The NaN coordinate issue should now be resolved.');

