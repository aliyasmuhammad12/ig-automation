// unfollow.js
const path = require('path');
const fs = require('fs');
const { delay } = require('./helpers/utils');
const { readJSON, ensureDirectory } = require('./helpers/files');
const { launchAdsPowerBrowser } = require('./helpers/adsPower');
const { clickProfileIcon, clickFollowingLink } = require('./helpers/instagramNavigation');
const { scrollFollowingList } = require('./helpers/scroll');
const { unfollowUsers } = require('./actions/unfollowUsers');
const config = require('./config');

const PROFILE_ID = process.argv[2];
const UNFOLLOW_LIMIT = parseInt(process.argv[3] || '20', 10);

if (!PROFILE_ID) {
  console.error("❌ Usage: node unfollow.js [profile_id] [limit]");
  process.exit(1);
}

(async () => {
  console.log(`[Unfollow] Starting for profile: ${PROFILE_ID}`);

  const mapping = readJSON(config.MAPPING_FILE);
  const username = mapping?.[PROFILE_ID]?.username;

  if (!username) {
    console.error(`❌ Username not found for profile ID: ${PROFILE_ID}`);
    process.exit(1);
  }

  const { browser, page } = await launchAdsPowerBrowser(PROFILE_ID);

  console.log(`[Unfollow] Navigating to profile icon`);
  await clickProfileIcon(page, username);

  const clicked = await clickFollowingLink(page, username);
  if (!clicked) {
    console.error("❌ Failed to open /following/ page");
    await browser.disconnect();
    process.exit(1);
  }

  await scrollFollowingList(page);
  await unfollowUsers(page, PROFILE_ID, username, UNFOLLOW_LIMIT);

  await browser.disconnect();
  console.log(`[Unfollow] ✅ Done for profile: ${PROFILE_ID}`);
})();
