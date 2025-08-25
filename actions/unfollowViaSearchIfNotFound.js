const { delay } = require('../helpers/utils');
const { searchAndOpenProfile } = require('./searchAndOpenProfile');
const { clickProfileIcon, clickFollowingLink } = require('../helpers/instagramNavigation');

async function clickHomeButton(page) {
  try {
    const homeIconSelector = 'svg[aria-label="Home"], svg[aria-label="Domov"], svg[aria-label="Inicio"]';
    const homeIcon = await page.$(homeIconSelector);
    if (homeIcon) {
      await homeIcon.evaluate(el => el.closest('a,button')?.click());
      await delay(1500 + Math.random() * 500);
      return true;
    }
    const logoLink = await page.$('a[href="/"]');
    if (logoLink) {
      await logoLink.click();
      await delay(1500 + Math.random() * 500);
      return true;
    }
    console.warn('[clickHomeButton] ⚠️ Could not find Home button.');
    return false;
  } catch (err) {
    console.error(`[clickHomeButton] ❌ Error: ${err.message}`);
    return false;
  }
}

async function unfollowViaSearchIfNotFound(page, username, myUsername) {
  const cleanUsername = username.replace(/^@/, '').toLowerCase();
  console.log(`[unfollowViaSearchIfNotFound] 🔍 Trying to unfollow @${cleanUsername} via search...`);

  let clicked = false;

  try {
    const found = await searchAndOpenProfile(page, cleanUsername);
    if (!found) {
      console.warn(`[unfollowViaSearchIfNotFound] ❌ Could not find profile: @${cleanUsername}`);
      return false;
    }

    await delay(3000);

    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button._aswp._aswr._asws._aswv._asw_._asx2'));
        for (const btn of buttons) {
          const labelDiv = btn.querySelector('div._ap3a');
          const labelText = labelDiv?.innerText?.trim().toLowerCase();
          if (['requested', 'following', 'zrušiť sledovanie', 'zrušené'].includes(labelText)) {
            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            btn.click();
            return { success: true, message: `Clicked "${labelText}" button` };
          }
        }
        return { success: false, message: 'No matching "Requested"/"Following" button found' };
      });

      if (result.success) {
        await delay(300 + Math.random() * 600);
        const confirmBtnSel = 'button._a9--._a9-_';
        try {
          await page.waitForSelector(confirmBtnSel, { visible: true, timeout: 5000 });
          await page.$eval(confirmBtnSel, el => el.click());
          console.log(`[unfollowViaSearchIfNotFound] ✅ Confirmed unfollow for @${cleanUsername}`);
          clicked = true;
          break;
        } catch {
          console.warn(`[unfollowViaSearchIfNotFound] ⚠️ Confirm button not found after click`);
        }
      } else {
        console.warn(`[unfollowViaSearchIfNotFound] ⚠️ Retry ${attempt + 1}: ${result.message}`);
        await delay(2000);
      }
    }

    if (!clicked) {
      console.warn(`[unfollowViaSearchIfNotFound] ❌ Failed to unfollow via search for @${cleanUsername}`);
    } else {
      await delay(2000 + Math.random() * 2000);
    }
  } catch (err) {
    console.error(`[unfollowViaSearchIfNotFound] ❌ Error: ${err.message}`);
  } finally {
    // ✅ Always return home, then go to your profile, then open Following
    await clickHomeButton(page);
    if (myUsername) {
      await clickProfileIcon(page, myUsername);
      await clickFollowingLink(page, myUsername);
    }
  }

  return clicked;
}

module.exports = { unfollowViaSearchIfNotFound };
