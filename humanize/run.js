// humanize/run.js
// Minimal test runner: use EXACT AdsPower profile from CLI args and run watchReels

const { ADSPOWER_API_PORT } = require('../config');
const { launchAdsPowerBrowser } = require('../helpers/adsPower');
const { mobileClick } = require('../helpers/mobileClick');
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
    // 🔍 PASSIVE DETECTION: Only report what AdsPower provides (don't change anything)
    const currentViewport = page.viewport();
    console.log(`📱 AdsPower profile configuration: ${currentViewport?.width || 'unknown'}x${currentViewport?.height || 'unknown'} (mobile: ${currentViewport?.isMobile || false})`);
    
    // 🚫 NO VIEWPORT OVERRIDES - Let AdsPower handle everything
    console.log('✅ Using AdsPower native configuration (no overrides)');

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
        
        // Use mobile-appropriate click instead of center-clicking
        await mobileClick(page, reelsSel, {
          waitForVisible: false,
          timeout: 5000,
          scrollIntoView: true,
          useTouch: true,
          addDelay: true
        }).catch(() => {});
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
