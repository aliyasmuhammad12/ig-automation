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
