const axios = require('axios');
const puppeteer = require('puppeteer');
const { delay } = require('./utils');

async function launchAdsPowerBrowser(profileId, port = 50325) {
  const apiUrl = `http://localhost:${port}/api/v1/browser/start?user_id=${profileId}`;
  console.log(`[AdsPower] Launching browser for profile: ${profileId}`);

  try {
    const res = await axios.get(apiUrl);
    const wsEndpoint = res?.data?.data?.ws?.puppeteer;

    if (!wsEndpoint || typeof wsEndpoint !== 'string') {
      throw new Error('Missing or invalid WebSocket endpoint from AdsPower API');
    }

    const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
    console.log(`[AdsPower] Connected to Puppeteer via WS`);

    const pages = await browser.pages();
    const page = pages.find(p => p.url().includes('instagram.com')) || pages[0];

    console.log(`[AdsPower] Navigating to Instagram home...`);
    await page.goto('https://www.instagram.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });

    // 🔍 PASSIVE DETECTION: Check Instagram layout without changing anything
    console.log(`[AdsPower] Detecting Instagram layout (passive - no changes)...`);
    const layoutInfo = await page.evaluate(() => {
      // Check for mobile vs desktop indicators (read-only)
      const mobileIndicators = [
        'div[role="button"]:has(circle[stroke*="url"])', // Mobile story circles
        'div[role="button"]:has(circle[stroke*="gradient"])', // Mobile story gradients
        'div[data-testid="mobile-nav-bar"]', // Mobile navigation
        'div[data-testid="mobile-bottom-nav"]' // Mobile bottom nav
      ];
      
      const desktopIndicators = [
        'aside[role="complementary"]', // Desktop sidebar
        'nav[aria-label="Primary navigation"]', // Desktop nav
        'div[data-testid="desktop-nav"]' // Desktop nav
      ];
      
      const hasMobile = mobileIndicators.some(sel => document.querySelector(sel));
      const hasDesktop = desktopIndicators.some(sel => document.querySelector(sel));
      
      return {
        hasMobile,
        hasDesktop,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        url: window.location.href
      };
    });
    
    // Report layout detection (passive - no changes made)
    if (layoutInfo.hasMobile && !layoutInfo.hasDesktop) {
      console.log('✅ Instagram serving MOBILE layout (AdsPower mobile emulation working)');
    } else if (layoutInfo.hasDesktop && !layoutInfo.hasMobile) {
      console.log('⚠️ Instagram serving DESKTOP layout (AdsPower may need mobile configuration)');
    } else {
      console.log('❓ Instagram layout unclear (mixed indicators)');
    }
    
    console.log(`[Layout] Window: ${layoutInfo.windowWidth}x${layoutInfo.windowHeight}, URL: ${layoutInfo.url}`);

    const extraDelay = 2240 + Math.floor(Math.random() * (6940 - 2240));
    console.log(`[AdsPower] Waiting extra ${extraDelay}ms after navigation...`);
    await delay(extraDelay);

    return { browser, page };
  } catch (err) {
    console.error(`❌ Failed to launch AdsPower browser: ${err.message}`);
    throw err;
  }
}

module.exports = {
  launchAdsPowerBrowser
};
