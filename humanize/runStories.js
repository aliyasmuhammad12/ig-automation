// humanize/runStories.js
// Standalone story watching runner

const { launchAdsPowerBrowser } = require('../helpers/adsPower');
const { watchStories } = require('./scripts/watchStories');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node humanize/runStories.js <profile_id> <duration_seconds>');
    console.log('Example: node humanize/runStories.js k12im9s2 120');
    process.exit(1);
  }
  
  const profileId = args[0];
  const durationSeconds = parseInt(args[1]) || 60;
  
  console.log(`🟢 Using AdsPower profile: ${profileId}`);
  console.log(`🎬 Running story watching for ~${durationSeconds}s...`);
  
  let browser, page;
  
  try {
    // Launch browser
    const browserData = await launchAdsPowerBrowser(profileId);
    browser = browserData.browser;
    page = browserData.page;
    
    // Check for Instagram challenge page (Puppeteer compatible)
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for page to settle
    const currentUrl = await page.url();
    
    if (currentUrl.includes('/challenge/') || currentUrl.includes('challenged')) {
      console.log('🚨 Instagram Challenge Page Detected!');
      console.log('📋 Current URL:', currentUrl);
      console.log('⚠️  Manual intervention required:');
      console.log('   1. Click "Dismiss" button in the browser');
      console.log('   2. Complete any verification steps');
      console.log('   3. Wait for normal Instagram feed to load');
      console.log('   4. Re-run the script');
      console.log('');
      console.log('💡 This usually happens when:');
      console.log('   - Account needs more organic activity');
      console.log('   - Running too many automated sessions');
      console.log('   - Profile needs warm-up period');
      return;
    }
    
    // Check for other Instagram blocks
    const pageContent = await page.evaluate(() => document.body.textContent).catch(() => '');
    if (pageContent.includes('automated behavior') || pageContent.includes('suspicious activity')) {
      console.log('🚨 Instagram has detected automated behavior!');
      console.log('📋 Page content indicates challenge/block');
      console.log('⚠️  Please handle manually in browser and try again');
      return;
    }
    
    console.log('✅ Instagram loaded normally, proceeding with story watching...');
    
    // Run story watching
    const result = await watchStories(page, durationSeconds, profileId);
    
    if (result.ok) {
      console.log(`✅ Story watching completed successfully!`);
      console.log(`📊 Results: ${result.storiesWatched} stories watched, ${result.reactionsSent} reactions sent`);
    } else {
      console.log(`❌ Story watching failed: ${result.error}`);
    }
    
  } catch (error) {
    console.error(`❌ Error during story watching:`, error.message);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore close errors
      }
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
