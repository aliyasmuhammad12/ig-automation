// helpers/instagramNavigation.js
const { delay } = require('./utils');
const { mobileClick, mobileClickEval } = require('./mobileClick');

async function clickProfileIcon(page, username) {
  const profileHref = `/${username.toLowerCase()}/`;
  const selector = `a[href="${profileHref}"]`;

  try {
    // Use mobile-appropriate click instead of center-clicking
    const clickSuccess = await mobileClick(page, selector, {
      waitForVisible: true,
      timeout: 10000,
      scrollIntoView: true,
      useTouch: true,
      addDelay: true
    });
    
    if (clickSuccess) {
      await page.waitForSelector('header section', { timeout: 15000 }); // wait for profile to load
      const waitTime = 900 + Math.floor(Math.random() * 5700);
      console.log(`[clickProfileIcon] ⏳ Waiting ${waitTime}ms after profile load`);
      await delay(waitTime);
      return true;
    } else {
      throw new Error('Mobile click failed');
    }
  } catch (err) {
    console.warn(`[clickProfileIcon] ⚠️ Failed direct href. Trying fallback image alt text.`);
    const imgSelector = `img[alt*="${username}"]`;
    try {
      // Use mobile-appropriate click for fallback
      const fallbackClickSuccess = await mobileClickEval(page, imgSelector, (img) => {
        const link = img.closest('a');
        if (link) {
          link.click();
          return true;
        }
        return false;
      }, {
        waitForVisible: true,
        timeout: 10000,
        scrollIntoView: true,
        addDelay: true
      });
      
      if (fallbackClickSuccess) {
        await delay(3000);
        return true;
      } else {
        throw new Error('Fallback mobile click failed');
      }
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
    // Use mobile-appropriate click instead of center-clicking
    const clickSuccess = await mobileClick(page, selector, {
      waitForVisible: true,
      timeout: 10000,
      scrollIntoView: true,
      useTouch: true,
      addDelay: true
    });
    
    if (clickSuccess) {
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }),
        delay(3000)
      ]);
      return true;
    } else {
      throw new Error('Mobile click failed');
    }
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
