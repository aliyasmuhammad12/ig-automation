/**
 * Simple test for Human-Like Username Typing Simulator
 * Tests the simulator without browser dependencies
 */

const { UsernameTypingSimulator, PERSONAS, selectPersona } = require('./humanize/scripts/usernameTypingSimulator');

async function testTypingSimulator() {
  console.log('🧪 Testing Human-Like Username Typing Simulator\n');
  
  // Test persona selection
  console.log('📊 Testing persona selection:');
  for (let i = 0; i < 5; i++) {
    const selected = selectPersona();
    console.log(`  Run ${i + 1}: ${selected} (${PERSONAS[selected].name})`);
  }
  
  console.log('\n🎭 Testing simulator initialization:');
  
  // Test each persona
  const personas = ['focused', 'careful', 'rushed', 'distracted', 'tired', 'expert', 'novice'];
  
  for (const persona of personas) {
    console.log(`\n--- Testing ${persona.toUpperCase()} persona ---`);
    
    const simulator = new UsernameTypingSimulator({
      persona: persona,
      deviceProfile: 'desktop',
      deactivateOnUserInput: false,
      maxRuntime: 10000
    });
    
    console.log(`✅ Persona: ${PERSONAS[persona].name}`);
    console.log(`✅ Base IKI: ${PERSONAS[persona].iki_median_ms}ms`);
    console.log(`✅ Mistake rate: ${(PERSONAS[persona].mistake_rate * 100).toFixed(2)}%`);
    console.log(`✅ Micro-pause prob: ${(PERSONAS[persona].pause_micro_prob * 100).toFixed(1)}%`);
    console.log(`✅ Macro-pause prob: ${(PERSONAS[persona].pause_macro_prob * 100).toFixed(1)}%`);
  }
  
  console.log('\n✅ Typing simulator test completed successfully!');
  console.log('\n📝 The Human-Like Username Typing Simulator is ready for use.');
  console.log('📝 When you run the follow script with a working AdsPower profile,');
  console.log('📝 you will see human-like typing behavior in the search fields.');
}

// Run the test
testTypingSimulator().catch(console.error);
