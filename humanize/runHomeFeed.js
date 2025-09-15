#!/usr/bin/env node

const path = require('path');
const fs = require('fs').promises;

// Import AdsPower integration
const { launchAdsPowerBrowser } = require('../helpers/adsPower');

// Import orchestrator components
const DailySessionOrchestrator = require('../smart-runner/modules/DailySessionOrchestrator');
const HomeFeedScroller = require('../smart-runner/modules/HomeFeedScroller');
const SessionMemory = require('../smart-runner/modules/SessionMemory');

class HomeFeedRunner {
  constructor(profileId, sessionParams, orchestratorData) {
    this.profileId = profileId;
    this.sessionParams = sessionParams;
    this.orchestratorData = orchestratorData;
    this.browser = null;
    this.page = null;
    this.orchestrator = null;
    this.homeFeedScroller = null;
    this.sessionMemory = null;
  }

  async initialize() {
    try {
      const configPath = path.join(__dirname, '..', 'smart-runner', 'config');
      const dataPath = path.join(__dirname, '..', 'smart-runner', 'data');
      
      // Initialize orchestrator components
      this.orchestrator = new DailySessionOrchestrator(configPath);
      this.homeFeedScroller = new HomeFeedScroller(configPath, dataPath);
      this.sessionMemory = new SessionMemory(dataPath);
      
      await Promise.all([
        this.orchestrator.initialize(),
        this.homeFeedScroller.initialize(),
        this.sessionMemory.initialize()
      ]);
      
      console.log('🎯 Home Feed Runner initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Home Feed Runner:', error.message);
      throw error;
    }
  }

  async run() {
    try {
      console.log(`🚀 Starting homefeed session for ${this.profileId}`);
      console.log(`📊 Session params:`, this.sessionParams);
      console.log(`🎭 Orchestrator data:`, this.orchestratorData);
      
      // Initialize components
      await this.initialize();
      
      // Launch browser
      await this.launchBrowser();
      
      // Execute homefeed session
      const result = await this.homeFeedScroller.executeSession(
        this.page,
        this.profileId,
        this.sessionParams,
        {
          profileId: this.profileId,
          mood: this.sessionParams.mood,
          accountAge: 180, // Default to seasoned
          recentBlocks: 0,
          likesToday: 0,
          postsSeenInSession: 0
        }
      );
      
      console.log('✅ Homefeed session completed:', result);
      return result;
      
    } catch (error) {
      console.error('❌ Homefeed session failed:', error.message);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async launchBrowser() {
    try {
      console.log(`🌐 Launching AdsPower browser for profile: ${this.profileId}`);
      
      // Launch AdsPower browser with the specific profile
      const browserData = await launchAdsPowerBrowser(this.profileId);
      this.browser = browserData.browser;
      this.page = browserData.page;
      
      // Check for Instagram challenge page
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for page to settle
      const currentUrl = await this.page.url();
      
      if (currentUrl.includes('/challenge/') || currentUrl.includes('challenged')) {
        console.log('🚨 Instagram Challenge Page Detected!');
        console.log('📋 Current URL:', currentUrl);
        console.log('⚠️  Manual intervention required:');
        console.log('   1. Click "Dismiss" button in the browser');
        console.log('   2. Complete any verification steps');
        console.log('   3. Wait for normal Instagram feed to load');
        console.log('   4. Re-run the script');
        throw new Error('Instagram challenge page detected - manual intervention required');
      }
      
      // Check for other Instagram blocks
      const pageContent = await this.page.evaluate(() => document.body.textContent).catch(() => '');
      if (pageContent.includes('automated behavior') || 
          pageContent.includes('suspicious activity') ||
          pageContent.includes('temporarily blocked')) {
        console.log('🚨 Instagram Block Detected!');
        console.log('⚠️  Account may be temporarily restricted');
        throw new Error('Instagram block detected - account may be restricted');
      }
      
      // Navigate to Instagram home feed if not already there
      if (!currentUrl.includes('instagram.com') || currentUrl.includes('instagram.com/')) {
        console.log('📱 Navigating to Instagram home feed...');
        await this.page.goto('https://www.instagram.com/', { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });
      }
      
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log('✅ AdsPower browser launched and Instagram loaded');
      
    } catch (error) {
      console.error('❌ Failed to launch AdsPower browser:', error.message);
      throw error;
    }
  }

  async cleanup() {
    try {
      if (this.browser) {
        await this.browser.close();
        console.log('🧹 Browser closed');
      }
    } catch (error) {
      console.log('⚠️  Error during cleanup:', error.message);
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('❌ Usage: node runHomeFeed.js <profileId> [sessionParams] [orchestratorData]');
    process.exit(1);
  }
  
  const profileId = args[0];
  let sessionParams = {};
  let orchestratorData = {};
  
  // Parse session params if provided
  if (args[1]) {
    try {
      sessionParams = JSON.parse(args[1]);
    } catch (error) {
      console.log('⚠️  Invalid session params JSON, using defaults');
    }
  }
  
  // Parse orchestrator data if provided
  if (args[2]) {
    try {
      orchestratorData = JSON.parse(args[2]);
    } catch (error) {
      console.log('⚠️  Invalid orchestrator data JSON, using defaults');
    }
  }
  
  // Set defaults if not provided
  if (!sessionParams.shape) {
    sessionParams = {
      shape: 'CasualSkim',
      mood: 'DayDrift',
      duration: 300000, // 5 minutes
      likeCaps: {
        followed: { min: 6, max: 12 },
        suggested: { min: 2, max: 6 },
        maxPerSession: 10
      },
      actions: {
        pullRefresh: false,
        scanPosts: 10,
        commentOpens: 2,
        profileHops: 1,
        captionExpansions: 1,
        saves: 0
      },
      exitConditions: ['caughtUp', 'timeLimit', 'capReached']
    };
  }
  
  if (!orchestratorData.shape) {
    orchestratorData = {
      shape: 'CasualSkim',
      reason: 'weightedSelection',
      freshnessCheck: { passed: true, newPostsCount: 5 }
    };
  }
  
  const runner = new HomeFeedRunner(profileId, sessionParams, orchestratorData);
  
  try {
    const result = await runner.run();
    console.log('🎉 Homefeed session completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('💥 Homefeed session failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = HomeFeedRunner;
