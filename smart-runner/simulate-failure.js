#!/usr/bin/env node

/**
 * Simulate Failure Script
 * 
 * This script can be used to test the Smart Runner's recovery system
 * by simulating various types of failures.
 * 
 * Usage:
 *   node simulate-failure.js --profile <profileId> --type <failureType> [--exitCode <code>]
 * 
 * Failure Types:
 *   - exit: Exit with specified code (default: 1)
 *   - timeout: Run for a long time then exit
 *   - error: Throw an unhandled error
 *   - hang: Hang indefinitely (for testing timeouts)
 */

const args = process.argv.slice(2);

function showHelp() {
  console.log(`
Simulate Failure Script - Test Smart Runner Recovery System

Usage:
  node simulate-failure.js --profile <profileId> --type <failureType> [options]

Options:
  --profile <id>     AdsPower profile ID (required)
  --type <type>      Failure type: exit, timeout, error, hang (required)
  --exitCode <code>  Exit code for 'exit' type (default: 1)
  --duration <ms>    Duration for 'timeout' type (default: 10000)
  --help             Show this help message

Examples:
  node simulate-failure.js --profile k12im9s2 --type exit --exitCode 1
  node simulate-failure.js --profile k12im9s2 --type timeout --duration 5000
  node simulate-failure.js --profile k12im9s2 --type error
  node simulate-failure.js --profile k12im9s2 --type hang

This script is designed to be called by the Smart Runner as a child process
to test the recovery system behavior.
`);
}

function parseArgs() {
  const config = {
    profile: null,
    type: null,
    exitCode: 1,
    duration: 10000
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--profile':
        config.profile = args[++i];
        break;
      case '--type':
        config.type = args[++i];
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

async function simulateFailure(config) {
  console.log(`🧪 Simulating failure for profile: ${config.profile}`);
  console.log(`📋 Failure type: ${config.type}`);
  
  switch (config.type) {
    case 'exit':
      console.log(`⏳ Running for 2 seconds, then exiting with code ${config.exitCode}...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log(`❌ Exiting with code ${config.exitCode}`);
      process.exit(config.exitCode);
      break;
      
    case 'timeout':
      console.log(`⏳ Running for ${config.duration}ms, then exiting with code 1...`);
      await new Promise(resolve => setTimeout(resolve, config.duration));
      console.log(`❌ Timeout reached, exiting with code 1`);
      process.exit(1);
      break;
      
    case 'error':
      console.log(`⏳ Running for 2 seconds, then throwing error...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log(`❌ Throwing unhandled error`);
      throw new Error('Simulated unhandled error for testing recovery');
      
    case 'hang':
      console.log(`⏳ Hanging indefinitely (use Ctrl+C to stop)...`);
      // Hang indefinitely
      await new Promise(() => {});
      break;
      
    default:
      console.error(`❌ Unknown failure type: ${config.type}`);
      console.error(`Valid types: exit, timeout, error, hang`);
      process.exit(1);
  }
}

// Main execution
async function main() {
  const config = parseArgs();
  
  if (!config.profile || !config.type) {
    console.error('❌ Error: --profile and --type are required');
    showHelp();
    process.exit(1);
  }
  
  if (!['exit', 'timeout', 'error', 'hang'].includes(config.type)) {
    console.error(`❌ Error: Invalid failure type '${config.type}'`);
    console.error('Valid types: exit, timeout, error, hang');
    process.exit(1);
  }
  
  try {
    await simulateFailure(config);
  } catch (error) {
    console.error(`❌ Unhandled error: ${error.message}`);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  process.exit(0);
});

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { simulateFailure, parseArgs };
