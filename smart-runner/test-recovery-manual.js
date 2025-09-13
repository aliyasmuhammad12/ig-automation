#!/usr/bin/env node

/**
 * Manual Recovery Test Script
 * 
 * This script allows you to manually test the Smart Runner's recovery system
 * by triggering failures and observing the recovery behavior.
 * 
 * Usage:
 *   node test-recovery-manual.js --pod <podName> [options]
 */

const SmartRunner = require('./smart-runner.js');
const args = process.argv.slice(2);

function showHelp() {
  console.log(`
Manual Recovery Test Script

Usage:
  node test-recovery-manual.js --pod <podName> [options]

Options:
  --pod <name>       Pod name to test (required)
  --profile <id>     Specific profile to test (optional)
  --failureType <type>  Type of failure to simulate: exit, timeout, error, hang
  --exitCode <code>  Exit code for 'exit' type (default: 1)
  --duration <ms>    Duration for 'timeout' type (default: 5000)
  --help             Show this help message

Examples:
  # Test recovery with exit code 1 failure
  node test-recovery-manual.js --pod podA --profile k12im9s2 --failureType exit --exitCode 1
  
  # Test recovery with timeout failure
  node test-recovery-manual.js --pod podA --profile k12im9s2 --failureType timeout --duration 3000
  
  # Test recovery with unhandled error
  node test-recovery-manual.js --pod podA --profile k12im9s2 --failureType error
  
  # Test recovery with hanging process
  node test-recovery-manual.js --pod podA --profile k12im9s2 --failureType hang
`);
}

function parseArgs() {
  const config = {
    pod: null,
    profile: null,
    failureType: 'exit',
    exitCode: 1,
    duration: 5000
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--pod':
        config.pod = args[++i];
        break;
      case '--profile':
        config.profile = args[++i];
        break;
      case '--failureType':
        config.failureType = args[++i];
        break;
      case '--exitCode':
        config.exitCode = parseInt(args[++i]);
        break;
      case '--duration':
        config.duration = parseInt(args[++i]);
        break;
      case '--help':
        showHelp();
        process.exit(0);
        break;
    }
  }

  return config;
}

async function testRecovery(config) {
  console.log('🧪 Manual Recovery Test Starting...\n');
  
  try {
    // Initialize Smart Runner
    const runner = new SmartRunner(config.pod);
    await runner.initialize();
    
    console.log(`📊 Testing recovery for pod: ${config.pod}`);
    if (config.profile) {
      console.log(`🎯 Target profile: ${config.profile}`);
    }
    console.log(`💥 Failure type: ${config.failureType}`);
    console.log(`⏰ Duration: ${config.duration}ms`);
    console.log(`🔢 Exit code: ${config.exitCode}\n`);
    
    // Get available profiles
    const profiles = runner.profiles;
    const targetProfile = config.profile || profiles[0];
    
    if (!profiles.includes(targetProfile)) {
      console.error(`❌ Profile ${targetProfile} not found in pod ${config.pod}`);
      console.error(`Available profiles: ${profiles.join(', ')}`);
      process.exit(1);
    }
    
    console.log(`🎯 Using profile: ${targetProfile}`);
    
    // Set up failure simulation parameters
    const failureParams = {
      failureType: config.failureType,
      exitCode: config.exitCode,
      duration: config.duration
    };
    
    console.log('\n🚀 Starting failure simulation...');
    console.log('📝 Watch the logs to see recovery behavior\n');
    
    // Start a session with the failure simulation
    const sessionId = require('uuid').v4();
    const plan = {
      action: 'start',
      type: 'simulate-failure',
      params: failureParams
    };
    
    // Update state to mark as running
    await runner.updateRunnerState(targetProfile, {
      flags: { running: true, needsRecovery: false }
    });
    
    // Log session start
    await runner.logEvent(targetProfile, 'start', plan.type, plan.params, sessionId);
    
    // Start the failure simulation
    const childProcess = runner.spawnChildProcess(plan.type, targetProfile, plan.params);
    
    // Set up event handlers
    childProcess.on('close', async (code) => {
      console.log(`\n📊 Child process exited with code: ${code}`);
      await runner.handleSessionEnd(targetProfile, sessionId, code);
      
      // Wait a moment for recovery to start
      setTimeout(async () => {
        console.log('\n🔍 Checking recovery status...');
        const state = await runner.getRunnerState(targetProfile);
        console.log(`📊 Profile state:`, {
          errorStreak: state.errorStreak,
          needsRecovery: state.flags.needsRecovery,
          paused: state.flags.paused,
          pausedUntil: state.pausedUntil
        });
        
        console.log('\n✅ Recovery test completed. Check the logs above for recovery behavior.');
        process.exit(0);
      }, 2000);
    });
    
    childProcess.on('error', async (error) => {
      console.error(`\n❌ Child process error:`, error.message);
      await runner.handleSessionError(targetProfile, sessionId, error);
      
      setTimeout(async () => {
        console.log('\n🔍 Checking recovery status...');
        const state = await runner.getRunnerState(targetProfile);
        console.log(`📊 Profile state:`, {
          errorStreak: state.errorStreak,
          needsRecovery: state.flags.needsRecovery,
          paused: state.flags.paused,
          pausedUntil: state.pausedUntil
        });
        
        console.log('\n✅ Recovery test completed. Check the logs above for recovery behavior.');
        process.exit(0);
      }, 2000);
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Received SIGINT, shutting down...');
      childProcess.kill('SIGTERM');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Main execution
async function main() {
  const config = parseArgs();
  
  if (!config.pod) {
    console.error('❌ Error: --pod is required');
    showHelp();
    process.exit(1);
  }
  
  if (!['exit', 'timeout', 'error', 'hang'].includes(config.failureType)) {
    console.error(`❌ Error: Invalid failure type '${config.failureType}'`);
    console.error('Valid types: exit, timeout, error, hang');
    process.exit(1);
  }
  
  await testRecovery(config);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testRecovery, parseArgs };
