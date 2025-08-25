/**
 * Test script for Human-Like Username Typing Simulator
 * 
 * This script tests the typing simulator without requiring a browser.
 */

const { UsernameTypingSimulator, PERSONAS, selectPersona } = require('./humanize/scripts/usernameTypingSimulator');

async function testTypingSimulator() {
  console.log('🧪 Testing Human-Like Username Typing Simulator\n');
  
  // Test persona selection
  console.log('📊 Testing persona selection:');
  const personas = ['focused', 'careful', 'rushed', 'distracted', 'tired', 'expert', 'novice'];
  
  for (let i = 0; i < 10; i++) {
    const selected = selectPersona();
    console.log(`  Run ${i + 1}: ${selected} (${PERSONAS[selected].name})`);
  }
  
  console.log('\n🎭 Testing different personas:');
  
  // Test each persona
  for (const persona of personas) {
    console.log(`\n--- Testing ${persona.toUpperCase()} persona ---`);
    
    const simulator = new UsernameTypingSimulator({
      persona: persona,
      deviceProfile: 'desktop',
      deactivateOnUserInput: false,
      maxRuntime: 10000
    });
    
    console.log(`Persona: ${PERSONAS[persona].name}`);
    console.log(`Base IKI: ${PERSONAS[persona].iki_median_ms}ms`);
    console.log(`Mistake rate: ${(PERSONAS[persona].mistake_rate * 100).toFixed(2)}%`);
    console.log(`Micro-pause prob: ${(PERSONAS[persona].pause_micro_prob * 100).toFixed(1)}%`);
    console.log(`Macro-pause prob: ${(PERSONAS[persona].pause_macro_prob * 100).toFixed(1)}%`);
  }
  
  console.log('\n✅ Typing simulator test completed!');
  console.log('\n📝 To test with actual browser:');
  console.log('1. Run: node main.js [profile_id] [username]');
  console.log('2. Check logs for "[TypingSimulator]" entries');
  console.log('3. Verify human-like typing behavior in search fields');
}

// Run the test
testTypingSimulator().catch(console.error);
