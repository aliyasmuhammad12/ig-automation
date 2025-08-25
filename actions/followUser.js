const { delay } = require('../helpers/utils');
const { searchAndOpenProfile } = require('./searchAndOpenProfile');

async function followUser(page, username) {
  console.log(`[FollowUser] Attempting to follow: ${username}`);

  const found = await searchAndOpenProfile(page, username);
  if (!found) {
    console.warn(`[FollowUser] Could not find profile: ${username}`);
    return false;
  }

  await delay(3000); // wait for profile to load

  let clicked = false;

  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll(
        'button._aswp._aswr._aswu._asw_._asx2, div._ap3a._aaco._aacw._aad6._aade'
      ));

      const followEl = elements.find(el => {
        const text = el.innerText.trim().toLowerCase();
        return text === 'follow' || text === 'sledovať';
      });

      if (followEl) {
        let btn = followEl;
        while (btn && btn.tagName !== 'BUTTON') {
          btn = btn.parentElement;
        }
        if (btn) {
          btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          btn.click();
          return { success: true, message: 'Clicked follow button' };
        }
        return { success: false, message: 'Found follow text but no clickable button' };
      }

      return { success: false, message: 'Follow button not found' };
    });

    if (result.success) {
      // Wait longer to allow UI state to update
      await delay(5000);

      const confirmed = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll(
          'button._aswp._aswr._aswu._asw_._asx2, div._ap3a._aaco._aacw._aad6._aade'
        ));
        const labels = elements.map(el => el.innerText.trim().toLowerCase());
        console.log('[FollowUser] Labels after click:', labels);
        return labels.some(label => ['following', 'requested'].includes(label));
      });

      if (confirmed) {
        console.log(`[FollowUser] ✅ Successfully followed: ${username}`);
      } else {
        console.warn(`[FollowUser] ⚠️ Clicked but could not confirm follow state`);
      }

      clicked = true;
      break;
    } else {
      console.log(`[FollowUser] Retry ${attempt + 1}: ${result.message}`);
      await delay(2000);
    }
  }

  return clicked;
}

module.exports = {
  followUser
};
