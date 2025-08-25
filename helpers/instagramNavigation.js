// helpers/instagramNavigation.js
const { delay } = require('./utils');

async function clickProfileIcon(page, username) {
  const profileHref = `/${username.toLowerCase()}/`;
  const selector = `a[href="${profileHref}"]`;

  try {
    await page.waitForSelector(selector, { visible: true, timeout: 10000 });
    await page.$eval(selector, el => {
      el.scrollIntoView({ block: 'center' });
      el.click();
    });
    await page.waitForSelector('header section', { timeout: 15000 }); // wait for profile to load
const waitTime = 900 + Math.floor(Math.random() * 5700);
console.log(`[clickProfileIcon] ⏳ Waiting ${waitTime}ms after profile load`);
await delay(waitTime);
    return true;
  } catch (err) {
    console.warn(`[clickProfileIcon] ⚠️ Failed direct href. Trying fallback image alt text.`);
    const imgSelector = `img[alt*="${username}"]`;
    try {
      await page.waitForSelector(imgSelector, { visible: true, timeout: 10000 });
      await page.$eval(imgSelector, img => {
        const link = img.closest('a');
        if (link) link.click();
      });
      await delay(3000);
      return true;
    } catch (fallbackErr) {
      console.error(`[clickProfileIcon] ❌ Fallback failed: ${fallbackErr.message}`);
      return false;
    }
  }
}

async function clickFollowingLink(page, username) {
  const href = `/${username.toLowerCase()}/following/`;
  const selector = `a[href="${href}"]`;

  try {
    await page.waitForSelector(selector, { visible: true, timeout: 10000 });
    await page.$eval(selector, el => {
      el.scrollIntoView({ block: 'center' });
      el.click();
    });
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }),
      delay(3000)
    ]);
    return true;
  } catch (err) {
    console.warn(`[clickFollowingLink] ⚠️ Primary link failed: ${err.message}`);
    // Optional: fallback using spans if Instagram changes layout
    return false;
  }
}

module.exports = {
  clickProfileIcon,
  clickFollowingLink
};
