const path = require('path');
const { delay, timestamp } = require('../helpers/utils');
const { readJSON, writeJSON, ensureDirectory } = require('../helpers/files');
const { unfollowViaSearchIfNotFound } = require('../actions/unfollowViaSearchIfNotFound');

async function unfollowUsers(page, profileId, username, limit) {
  const logsDir = path.join(__dirname, '..', 'logs');
  const followedPath = path.join(logsDir, 'followed.json');
  const unfollowedPath = path.join(logsDir, 'unfollowed.json');

  ensureDirectory(logsDir);

  let followedLog = readJSON(followedPath) || [];
  const unfollowedLog = readJSON(unfollowedPath) || [];

  const alreadyUnfollowed = new Set(
    unfollowedLog.filter(u => u.account === profileId).map(u => u.username)
  );

  const toUnfollowAll = followedLog
    .filter(u => u.account === profileId && !alreadyUnfollowed.has(u.username))
    .map(u => u.username);

  const toUnfollow = toUnfollowAll.slice(0, limit);

  if (toUnfollow.length === 0) {
    console.log(`[UnfollowUsers] ⚠️ No users left to unfollow for profile ${profileId}`);
    return;
  }

  for (const target of toUnfollow) {
    console.log(`[UnfollowUsers] 🔍 Attempting to unfollow: ${target}`);

    // Check if user is visible in Following list
    const isVisible = await page.evaluate((username) => {
      const spans = Array.from(document.querySelectorAll('span._ap3a'));
      return spans.some(span => span.innerText.trim().toLowerCase() === username.toLowerCase());
    }, target);

    let clicked = false;

    for (let attempt = 0; attempt < 5 && !clicked; attempt++) {
      const result = await page.evaluate((username) => {
        const containers = Array.from(document.querySelectorAll('div.xdj266r.x14z9mp.xat24cr.x1lziwak'));

        for (const container of containers) {
          const span = container.querySelector('span._ap3a');
          if (!span || span.innerText.trim().toLowerCase() !== username.toLowerCase()) continue;

          const button = container.querySelector('button._aswp._aswr._aswv._asw_._asx2');
          if (!button) {
            return { success: false, message: 'Unfollow button not found for ' + username };
          }

          button.scrollIntoView({ behavior: 'smooth', block: 'center' });
          button.click();
          return { success: true, message: 'Clicked unfollow for ' + username };
        }

        return { success: false, message: 'No matching container found for ' + username };
      }, target);

      if (result.success) {
        console.log(`[UnfollowUsers] ✅ ${result.message}`);
        clicked = true;
        break;
      } else {
        console.warn(`[UnfollowUsers] ⚠️ Attempt ${attempt + 1} failed: ${result.message}`);
        await delay(2000);
      }
    }

    let unfollowed = false;

    if (clicked) {
      await delay(2000);
      await page.evaluate(() => {
        const confirmBtn = Array.from(document.querySelectorAll('button'))
          .find(btn =>
            btn.innerText.trim().toLowerCase() === 'unfollow' ||
            btn.innerText.trim().toLowerCase() === 'zrušiť sledovanie'
          );
        if (confirmBtn) confirmBtn.click();
      });

      console.log(`[UnfollowUsers] ✅ Confirmed unfollow for ${target}`);
      unfollowed = true;
    } else {
      console.warn(`[UnfollowUsers] ⚠️ Not found in list. Trying fallback via search…`);
      const result = await unfollowViaSearchIfNotFound(page, target, username);
      if (result) {
        console.log(`[UnfollowUsers] ✅ Unfollowed via search fallback`);
        unfollowed = true;
      } else {
        console.warn(`[UnfollowUsers] ❌ Failed to unfollow ${target} via any method.`);
      }
    }

    if (unfollowed) {
      unfollowedLog.push({ account: profileId, username: target, time: timestamp() });
      writeJSON(unfollowedPath, unfollowedLog);
      followedLog = followedLog.filter(entry => {
        return !(entry.account === profileId && entry.username === target);
      });
      writeJSON(followedPath, followedLog);
      console.log(`[UnfollowUsers] 🗑️ Removed ${target} from followed.json`);
    }

    // Wait between unfollows
    await delay(3000 + Math.random() * 2000);
  }
}

module.exports = {
  unfollowUsers
};
