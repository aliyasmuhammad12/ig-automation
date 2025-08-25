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
