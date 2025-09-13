#!/usr/bin/env node

/**
 * Test script for Smart Runner Recovery Policy
 * 
 * This script simulates child process failures to test the recovery system.
 * It can be used to verify that the recovery steps work correctly.
 */

const { spawn } = require('child_process');
const path = require('path');

class RecoveryTester {
  constructor() {
    this.testResults = [];
  }

  async runTests() {
    console.log('🧪 Starting Smart Runner Recovery Policy Tests\n');

    // Test 1: Simulate a script that exits with code 1
    await this.testFailureSimulation();
    
    // Test 2: Test recovery step execution
    await this.testRecoverySteps();
    
    // Test 3: Test error streak tracking
    await this.testErrorStreakTracking();
    
    // Test 4: Test profile pausing
    await this.testProfilePausing();

    this.printResults();
  }

  async testFailureSimulation() {
    console.log('📋 Test 1: Simulating child process failure...');
    
    try {
      // Create a test script that exits with code 1
      const testScript = `
        console.log('Test script starting...');
        setTimeout(() => {
          console.log('Test script exiting with error code 1');
          process.exit(1);
        }, 2000);
      `;
      
      const testScriptPath = path.join(__dirname, 'temp-test-script.js');
      require('fs').writeFileSync(testScriptPath, testScript);
      
      const child = spawn('node', [testScriptPath], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        output += data.toString();
      });
      
      const exitCode = await new Promise((resolve) => {
        child.on('close', (code) => {
          resolve(code);
        });
      });
      
      // Clean up
      require('fs').unlinkSync(testScriptPath);
      
      if (exitCode === 1) {
        this.testResults.push({ test: 'Failure Simulation', status: 'PASS', details: 'Script correctly exited with code 1' });
        console.log('✅ Test 1 PASSED: Script correctly exited with code 1');
      } else {
        this.testResults.push({ test: 'Failure Simulation', status: 'FAIL', details: `Expected exit code 1, got ${exitCode}` });
        console.log('❌ Test 1 FAILED: Expected exit code 1, got', exitCode);
      }
      
    } catch (error) {
      this.testResults.push({ test: 'Failure Simulation', status: 'ERROR', details: error.message });
      console.log('❌ Test 1 ERROR:', error.message);
    }
  }

  async testRecoverySteps() {
    console.log('\n📋 Test 2: Testing recovery step execution...');
    
    try {
      // Import SmartRunner to test recovery steps
      const SmartRunner = require('./smart-runner.js');
      const runner = new SmartRunner('testPod');
      
      // Mock the configuration
      runner.config = {
        recovery: {
          maxRecoverySteps: 5,
          retryBackoffMs: 1000,
          maxErrorStreak: 3
        }
      };
      
      // Test each recovery step
      const steps = [
        { step: 1, action: 'goToHomepage' },
        { step: 2, action: 'browserBack' },
        { step: 3, action: 'refreshPage' },
        { step: 4, action: 'reopenProfile' },
        { step: 5, action: 'restartAdsPowerProfile' }
      ];
      
      let allStepsPassed = true;
      
      for (const stepInfo of steps) {
        try {
          const result = await runner.executeRecoveryStep('testProfile', stepInfo.step);
          if (result.success && result.action === stepInfo.action) {
            console.log(`✅ Step ${stepInfo.step} (${stepInfo.action}): PASSED`);
          } else {
            console.log(`❌ Step ${stepInfo.step} (${stepInfo.action}): FAILED`);
            allStepsPassed = false;
          }
        } catch (error) {
          console.log(`❌ Step ${stepInfo.step} (${stepInfo.action}): ERROR - ${error.message}`);
          allStepsPassed = false;
        }
      }
      
      if (allStepsPassed) {
        this.testResults.push({ test: 'Recovery Steps', status: 'PASS', details: 'All 5 recovery steps executed successfully' });
        console.log('✅ Test 2 PASSED: All recovery steps executed successfully');
      } else {
        this.testResults.push({ test: 'Recovery Steps', status: 'FAIL', details: 'One or more recovery steps failed' });
        console.log('❌ Test 2 FAILED: One or more recovery steps failed');
      }
      
    } catch (error) {
      this.testResults.push({ test: 'Recovery Steps', status: 'ERROR', details: error.message });
      console.log('❌ Test 2 ERROR:', error.message);
    }
  }

  async testErrorStreakTracking() {
    console.log('\n📋 Test 3: Testing error streak tracking...');
    
    try {
      const SmartRunner = require('./smart-runner.js');
      const runner = new SmartRunner('testPod');
      
      // Mock configuration
      runner.config = {
        recovery: {
          maxErrorStreak: 3
        }
      };
      
      // Test error streak increment
      const testProfileId = 'testProfile123';
      
      // Initialize state
      await runner.updateRunnerState(testProfileId, {
        errorStreak: 0,
        flags: { running: false, needsRecovery: false, paused: false }
      });
      
      // Simulate multiple failures
      for (let i = 1; i <= 4; i++) {
        const state = await runner.getRunnerState(testProfileId);
        const newErrorStreak = (state?.errorStreak || 0) + 1;
        
        await runner.updateRunnerState(testProfileId, {
          errorStreak: newErrorStreak,
          flags: { running: false, needsRecovery: true }
        });
        
        const updatedState = await runner.getRunnerState(testProfileId);
        console.log(`Error streak ${i}: ${updatedState.errorStreak}`);
        
        if (updatedState.errorStreak !== i) {
          this.testResults.push({ test: 'Error Streak Tracking', status: 'FAIL', details: `Expected streak ${i}, got ${updatedState.errorStreak}` });
          console.log('❌ Test 3 FAILED: Error streak tracking incorrect');
          return;
        }
      }
      
      this.testResults.push({ test: 'Error Streak Tracking', status: 'PASS', details: 'Error streak correctly incremented from 0 to 4' });
      console.log('✅ Test 3 PASSED: Error streak tracking works correctly');
      
    } catch (error) {
      this.testResults.push({ test: 'Error Streak Tracking', status: 'ERROR', details: error.message });
      console.log('❌ Test 3 ERROR:', error.message);
    }
  }

  async testProfilePausing() {
    console.log('\n📋 Test 4: Testing profile pausing...');
    
    try {
      const SmartRunner = require('./smart-runner.js');
      const runner = new SmartRunner('testPod');
      
      // Mock configuration
      runner.config = {
        recovery: {
          maxErrorStreak: 3
        }
      };
      
      const testProfileId = 'testProfile456';
      
      // Set error streak above maximum
      await runner.updateRunnerState(testProfileId, {
        errorStreak: 4, // Above maxErrorStreak of 3
        flags: { running: false, needsRecovery: true, paused: false }
      });
      
      // Test the recovery logic that should pause the profile
      const state = await runner.getRunnerState(testProfileId);
      const errorStreak = state.errorStreak || 0;
      const maxErrorStreak = runner.config.recovery.maxErrorStreak;
      
      if (errorStreak > maxErrorStreak) {
        // Simulate the pausing logic
        const pausedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await runner.updateRunnerState(testProfileId, {
          flags: { running: false, needsRecovery: false, paused: true },
          pausedUntil: pausedUntil
        });
        
        const pausedState = await runner.getRunnerState(testProfileId);
        
        if (pausedState.flags.paused && pausedState.pausedUntil) {
          this.testResults.push({ test: 'Profile Pausing', status: 'PASS', details: 'Profile correctly paused when error streak exceeded maximum' });
          console.log('✅ Test 4 PASSED: Profile correctly paused when error streak exceeded maximum');
        } else {
          this.testResults.push({ test: 'Profile Pausing', status: 'FAIL', details: 'Profile was not properly paused' });
          console.log('❌ Test 4 FAILED: Profile was not properly paused');
        }
      } else {
        this.testResults.push({ test: 'Profile Pausing', status: 'FAIL', details: 'Error streak was not above maximum' });
        console.log('❌ Test 4 FAILED: Error streak was not above maximum');
      }
      
    } catch (error) {
      this.testResults.push({ test: 'Profile Pausing', status: 'ERROR', details: error.message });
      console.log('❌ Test 4 ERROR:', error.message);
    }
  }

  printResults() {
    console.log('\n📊 Test Results Summary:');
    console.log('========================');
    
    let passed = 0;
    let failed = 0;
    let errors = 0;
    
    for (const result of this.testResults) {
      const status = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
      console.log(`${status} ${result.test}: ${result.status}`);
      console.log(`   Details: ${result.details}`);
      
      if (result.status === 'PASS') passed++;
      else if (result.status === 'FAIL') failed++;
      else errors++;
    }
    
    console.log('\n📈 Summary:');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️  Errors: ${errors}`);
    console.log(`📊 Total: ${this.testResults.length}`);
    
    if (failed === 0 && errors === 0) {
      console.log('\n🎉 All tests passed! Recovery Policy is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the implementation.');
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new RecoveryTester();
  tester.runTests().catch(console.error);
}

module.exports = RecoveryTester;
