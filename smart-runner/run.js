#!/usr/bin/env node

const SmartRunner = require('./smart-runner');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('🚀 Smart Runner CLI');
    console.log('');
    console.log('Usage:');
    console.log('  node run.js --pod <podName>     Start runner for specific pod');
    console.log('  node run.js --test              Run tests');
    console.log('  node run.js --help              Show this help');
    console.log('');
    console.log('Examples:');
    console.log('  node run.js --pod podA');
    console.log('  node run.js --test');
    return;
  }
  
  if (args.includes('--help')) {
    console.log('🚀 Smart Runner CLI');
    console.log('');
    console.log('Usage:');
    console.log('  node run.js --pod <podName>     Start runner for specific pod');
    console.log('  node run.js --test              Run tests');
    console.log('  node run.js --help              Show this help');
    return;
  }
  
  if (args.includes('--test')) {
    const testRunner = require('./test-runner');
    await testRunner();
    return;
  }
  
  const podIndex = args.indexOf('--pod');
  if (podIndex === -1 || podIndex === args.length - 1) {
    console.error('❌ Error: --pod argument required');
    console.log('Usage: node run.js --pod <podName>');
    process.exit(1);
  }
  
  const podName = args[podIndex + 1];
  const runner = new SmartRunner(podName);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    await runner.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    await runner.stop();
    process.exit(0);
  });
  
  try {
    await runner.initialize();
    await runner.start();
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
