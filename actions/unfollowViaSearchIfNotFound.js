const { delay } = require('../helpers/utils');
const { mobileClick, mobileClickEval } = require('../helpers/mobileClick');
const { searchAndOpenProfile } = require('./searchAndOpenProfile');
const { clickProfileIcon, clickFollowingLink } = require('../helpers/instagramNavigation');

async function clickHomeButton(page) {
  try {
    const homeIconSelector = 'svg[aria-label="Home"], svg[aria-label="Domov"], svg[aria-label="Inicio"]';
    
    // Try mobile click for home icon
    const homeClickSuccess = await mobileClickEval(page, homeIconSelector, (el) => {
      const link = el.closest('a,button');
      if (link) {
        link.click();
        return true;
      }
      return false;
    }, {
      waitForVisible: true,
      timeout: 5000,
      scrollIntoView: true,
      addDelay: true
    });
    
    if (homeClickSuccess) {
      await delay(1500 + Math.random() * 500);
      return true;
    }
    
    // Fallback to logo link
    const logoClickSuccess = await mobileClick(page, 'a[href="/"]', {
      waitForVisible: true,
      timeout: 5000,
      scrollIntoView: true,
      useTouch: true,
      addDelay: true
    });
    
    if (logoClickSuccess) {
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
            return { success: true, message: `Found "${labelText}" button`, buttonSelector: 'button._aswp._aswr._asws._aswv._asw_._asx2' };
          }
        }
        return { success: false, message: 'No matching "Requested"/"Following" button found' };
      });

      if (result.success) {
        // Use mobile-appropriate click instead of center-clicking
        const clickSuccess = await mobileClick(page, result.buttonSelector, {
          waitForVisible: true,
          timeout: 10000,
          scrollIntoView: true,
          useTouch: true,
          addDelay: true
        });
        
        if (clickSuccess) {
          await delay(300 + Math.random() * 600);
          const confirmBtnSel = 'button._a9--._a9-_';
          
          // Use mobile-appropriate click for confirmation
          const confirmClickSuccess = await mobileClick(page, confirmBtnSel, {
            waitForVisible: true,
            timeout: 5000,
            scrollIntoView: true,
            useTouch: true,
            addDelay: true
          });
          
          if (confirmClickSuccess) {
            console.log(`[unfollowViaSearchIfNotFound] ✅ Confirmed unfollow for @${cleanUsername}`);
            clicked = true;
            break;
          } else {
            console.warn(`[unfollowViaSearchIfNotFound] ⚠️ Confirm button click failed`);
          }
        } else {
          console.warn(`[unfollowViaSearchIfNotFound] ⚠️ Mobile click failed on attempt ${attempt + 1}`);
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
