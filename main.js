const path = require('path');
const fs = require('fs');
const config = require('./config');
const { delay, timestamp } = require('./helpers/utils');
const {
  readJSON,
  writeJSON,
  readUsernames,
  writeUsernames,
  ensureDirectory
} = require('./helpers/files');
const { launchAdsPowerBrowser } = require('./helpers/adsPower');
const { followUser } = require('./actions/followUser');

const PROFILE_ID = process.argv[2];
const FOLLOW_LIMIT = parseInt(process.argv[3] || '1000', 10);

if (!PROFILE_ID) {
  console.error('❌ Usage: node main.js [profile_id] [limit]');
  process.exit(1);
}

(async () => {
  console.log(`[Main] Starting for profile: ${PROFILE_ID}`);

  // Load mapping
  const mapping = readJSON(config.MAPPING_FILE);
  const entry = mapping?.[PROFILE_ID];

  let groupFile = entry?.file || config.DEFAULT_GROUP_FILE;
  let groupPath = path.join(config.TARGETS_DIR, groupFile);

  // Fallback if file not found
  if (!fs.existsSync(groupPath)) {
    const files = fs.readdirSync(config.TARGETS_DIR);
    const match = files.find(f => path.parse(f).name === path.parse(groupFile).name);
    if (match) {
      groupPath = path.join(config.TARGETS_DIR, match);
      console.warn(`[Main] ⚠️ Using fallback target file: ${match}`);
    } else {
      console.error(`[Main] ❌ Target file "${groupFile}" not found`);
      process.exit(1);
    }
  }

  // Load usernames
  let usernames = readUsernames(groupPath);
  if (!usernames.length) {
    console.warn(`[Main] ⚠️ No usernames left in ${path.basename(groupPath)}`);
    process.exit(0);
  }

  const toFollow = usernames.slice(0, FOLLOW_LIMIT);
  console.log(`[Main] Preparing to follow ${toFollow.length} user(s)`);

  // Prepare log
  ensureDirectory(path.dirname(config.FOLLOW_LOG));
  let followedLog = fs.existsSync(config.FOLLOW_LOG)
    ? readJSON(config.FOLLOW_LOG) || []
    : [];

  // Launch browser and navigate
const { browser, page } = await launchAdsPowerBrowser(PROFILE_ID);

  // Follow users
  for (const username of toFollow) {
    try {
      const success = await followUser(page, username);
      if (success) {
        followedLog.push({ account: PROFILE_ID, username, time: timestamp() });
        usernames = usernames.filter(u => u !== username);
        writeUsernames(groupPath, usernames);
        writeJSON(config.FOLLOW_LOG, followedLog);
      } else {
        console.warn(`[Main] Skipped: ${username}`);
      }

      await delay(3000 + Math.random() * 2000);
    } catch (err) {
      console.error(`❌ Error while processing ${username}: ${err.message}`);
    }
  }

  await browser.disconnect();
  console.log(`[Main] ✅ Done! Followed ${toFollow.length} user(s)`);
})();
