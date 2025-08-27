// humanize/run.js
// Minimal test runner: use EXACT AdsPower profile from CLI args and run watchReels

const { ADSPOWER_API_PORT } = require('../config');
const { launchAdsPowerBrowser } = require('../helpers/adsPower');
const task = require('./scripts/watchReels');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const profileId = process.argv[2];
  const runSeconds = Number(process.argv[3] || 60);

  if (!profileId) {
    console.error('Usage: node humanize/run.js <PROFILE_ID> [SECONDS]');
    process.exit(1);
  }

  console.log(`🟢 Using EXACT AdsPower profile: ${profileId} (port ${ADSPOWER_API_PORT})`);

  const { browser, page } = await launchAdsPowerBrowser(profileId, ADSPOWER_API_PORT);

  try {
    // Get the actual viewport from AdsPower browser instead of overriding it
    const currentViewport = page.viewport();
    console.log(`📱 AdsPower browser viewport: ${currentViewport?.width || 'unknown'}x${currentViewport?.height || 'unknown'}`);
    
    // Only set viewport if it's not already configured by AdsPower
    if (!currentViewport || !currentViewport.width || !currentViewport.height) {
      console.log('⚠️ No viewport detected, setting default mobile viewport');
      await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
    } else {
      console.log('✅ Using AdsPower browser resolution');
    }

    console.log('🌐 Navigating to Instagram Reels…');
    try {
      await page.goto('https://www.instagram.com/reels/', { waitUntil: 'domcontentloaded', timeout: 180000 });
    } catch (navErr) {
      console.warn('⚠️ Direct /reels/ navigation timed out. Falling back via home…');
      try {
        await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 180000 });
        // Try clicking the Reels tab/link if present
        const reelsSel = 'a[role="link"][href*="/reels/"], svg[aria-label="Reels"]';
        await page.waitForSelector(reelsSel, { visible: true, timeout: 10000 }).catch(() => {});
        await page.$eval(reelsSel, el => (el.closest('a') || el).click()).catch(() => {});
      } catch {}
    }

    await sleep(1500 + Math.floor(Math.random() * 1500));

    console.log(`🎬 Running watchReels for ~${runSeconds}s…`);
    const result = await task.run(page, runSeconds);

    console.log('✅ watchReels finished:', result);
  } catch (err) {
    console.error('❌ Runner error:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await sleep(500);
    // Leave AdsPower profile running so it stays warmed up
    try { await browser.disconnect(); } catch {}
  }
})();
