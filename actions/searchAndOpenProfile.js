const { delay } = require('../helpers/utils');
const config = require('../config');

async function clickSearchIcon(page) {
  const anchorSel = 'a[href="/explore/"]';
  const svgSel = 'svg[aria-label="Explore"]';

  try {
    console.log('[clickSearchIcon] ⏳ Waiting for anchor:', anchorSel);
    await page.waitForSelector(anchorSel, { visible: true, timeout: 30000 });
    console.log('[clickSearchIcon] ✅ Found anchor, clicking...');
    await page.$eval(anchorSel, el => {
      el.scrollIntoView({ block: 'center' });
      el.click();
    });
    await delay(3000);
    console.log('[clickSearchIcon] ✅ Clicked anchor');
    return true;
  } catch (err) {
    console.warn('[clickSearchIcon] ❌ Anchor not found or clickable:', err.message);
  }

  try {
    console.log('[clickSearchIcon] ⏳ Trying fallback SVG:', svgSel);
    await page.waitForSelector(svgSel, { visible: true, timeout: 5000 });
    await page.$eval(svgSel, el => el.closest('a')?.click());
    await delay(3000);
    console.log('[clickSearchIcon] ✅ Clicked fallback SVG');
    return true;
  } catch (err2) {
    console.error('[clickSearchIcon] ❌ Fallback SVG click failed:', err2.message);
  }

  console.error('[clickSearchIcon] ❌ All attempts failed');
  return false;
}

async function findSearchInputSelector(page) {
  const candidates = [
    config.SEARCH_INPUT_SELECTOR,
    'input[placeholder="Search"]',
    'input[aria-label="Search input"]',
    'input[role="searchbox"]',
    'input[type="text"][placeholder]'
  ].filter(Boolean);

  for (const sel of candidates) {
    try {
      await page.waitForSelector(sel, { visible: true, timeout: 3000 });
      return sel;
    } catch {}
  }
  return null;
}

async function clearSearchBar(page, inputSel) {
  const hasText = await page.evaluate(sel => {
    const input = document.querySelector(sel);
    return input && input.value.trim().length > 0;
  }, inputSel);

  if (!hasText) {
    console.log('[clearSearchBar] 🔹 Input already empty.');
    return;
  }

  const clearBtnSel = 'button._aben';

  try {
    console.log('[clearSearchBar] ⏳ Looking for clear button...');
    await page.waitForSelector(clearBtnSel, { visible: true, timeout: 5000 });
    console.log('[clearSearchBar] ✅ Found clear button, clicking...');
    await page.$eval(clearBtnSel, el => {
      el.scrollIntoView({ block: 'center' });
      el.click();
    });
    await delay(1000);
    console.log('[clearSearchBar] ✅ Clicked clear button.');
  } catch (err) {
    console.warn('[clearSearchBar] ❌ Clear button not found or failed to click:', err.message);
  }
}

async function searchAndOpenProfile(page, username) {
  const cleanUsername = username.replace(/^@/, '').toLowerCase();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      console.log(`[searchAndOpenProfile] Attempt ${attempt + 1}`);
      const ok = await clickSearchIcon(page);
      if (!ok) throw new Error("Could not click search icon");

      const inputSel = await findSearchInputSelector(page);
      if (!inputSel) throw new Error('Search input not found');

      await clearSearchBar(page, inputSel);
      await delay(500);
      await page.type(inputSel, cleanUsername);
      await delay(3000);

      const profileSelector = `li a[href="/${cleanUsername}/"]`;
      await page.waitForSelector(profileSelector, { visible: true, timeout: 10000 });

      await page.$eval(profileSelector, el => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.click();
      });

      await delay(5000);
      return true;
    } catch (err) {
      console.warn(`[searchAndOpenProfile] Attempt ${attempt + 1} failed: ${err.message}`);

      if (attempt === 0) {
        try {
          console.log('[searchAndOpenProfile] Retrying via homepage fallback');

          const homeSelector = 'a[href="/"][role="link"]';

await page.waitForSelector(homeSelector, { visible: true, timeout: 10000 });
await page.$eval(homeSelector, el => {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.click();
});
await delay(3000);


          await clickSearchIcon(page);

          continue; // retry next attempt
        } catch (fallbackErr) {
          console.warn('[searchAndOpenProfile] Fallback to home failed:', fallbackErr.message);
          break;
        }
      }
    }
  }

  // Final fallback: try navigating directly to the profile URL
  try {
    const url = `https://www.instagram.com/${cleanUsername}/`;
    console.log(`[searchAndOpenProfile] 🌐 Direct navigation fallback → ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await delay(4000);
    const hasHeader = await page.$('header, header section');
    if (hasHeader) {
      console.log('[searchAndOpenProfile] ✅ Direct navigation landed on profile');
      return true;
    }
  } catch (e) {
    console.warn('[searchAndOpenProfile] Direct navigation fallback failed:', e.message);
  }

  console.warn(`[searchAndOpenProfile] ❌ Failed to find user: ${username}`);
  return false;
}

module.exports = {
  searchAndOpenProfile
};
