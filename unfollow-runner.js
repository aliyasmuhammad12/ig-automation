const fs = require("fs");
const { execSync } = require("child_process");

const path = require("path");
const MAPPING_FILE      = path.join(__dirname, "mapping.json");
const STATS_FILE        = path.join(__dirname, "account_stats.json");
const UNFOLLOW_LOG_FILE = path.join(__dirname, "logs", "unfollowed.json");
const FOLLOW_LOG_FILE   = path.join(__dirname, "logs", "followed.json");
const COOLDOWN_HOURS = 1 / 60;

const UNFOLLOW_RANGE = { min: 5, max: 10 };

function hoursSince(lastRun) {
  if (!lastRun) return Infinity;
  return (new Date() - new Date(lastRun)) / (1000 * 60 * 60);
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Load config
if (!fs.existsSync(MAPPING_FILE)) {
  console.error("❌ Missing mapping.json");
  process.exit(1);
}

const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, "utf-8"));

let stats = {};
if (fs.existsSync(STATS_FILE)) {
  try {
    stats = JSON.parse(fs.readFileSync(STATS_FILE, "utf-8")) || {};
    if (Array.isArray(stats)) stats = {}; // fix bad shape from earlier runs
  } catch {
    stats = {};
  }
}


const followedLog = fs.existsSync(FOLLOW_LOG_FILE)
  ? JSON.parse(fs.readFileSync(FOLLOW_LOG_FILE, "utf-8"))
  : [];

const unfollowedLog = fs.existsSync(UNFOLLOW_LOG_FILE)
  ? JSON.parse(fs.readFileSync(UNFOLLOW_LOG_FILE, "utf-8"))
  : [];

const now = new Date();

const readyAccounts = Object.entries(mapping)
  .filter(([id]) => {
    // Filter: skip if no followed entries
    const followedForThis = followedLog.filter(u => u.account === id);
    if (followedForThis.length === 0) return false;

    // Filter: skip if all followed usernames already unfollowed
    const unfollowedSet = new Set(
      unfollowedLog.filter(u => u.account === id).map(u => u.username)
    );
    const remaining = followedForThis.filter(u => !unfollowedSet.has(u.username));
    if (remaining.length === 0) return false;

    // Filter: cooldown check
    return hoursSince(stats[id]?.last_unfollow) > COOLDOWN_HOURS;
  })
  .sort((a, b) => {
    const aTime = stats[a[0]]?.last_unfollow ? new Date(stats[a[0]].last_unfollow) : new Date(0);
    const bTime = stats[b[0]]?.last_unfollow ? new Date(stats[b[0]].last_unfollow) : new Date(0);
    return aTime - bTime;
  });

if (readyAccounts.length === 0) {
  console.log("⏳ No accounts are eligible for unfollowing. Try later.");
  process.exit(0);
}

for (const [userId, data] of readyAccounts) {
  const UNFOLLOW_LIMIT = getRandomInt(UNFOLLOW_RANGE.min, UNFOLLOW_RANGE.max);
  console.log(`🚀 Running unfollow.js for ${userId} (${data.username}) with UNFOLLOW_LIMIT=${UNFOLLOW_LIMIT}`);

  const runStart = new Date();

  try {
    execSync(`node unfollow.js ${userId} ${UNFOLLOW_LIMIT}`, { stdio: "inherit" });

    // ✅ Reload updated unfollowed log and get new entries
    const updatedLog = fs.existsSync(UNFOLLOW_LOG_FILE)
      ? JSON.parse(fs.readFileSync(UNFOLLOW_LOG_FILE, "utf-8"))
      : [];

    const unfollowedNow = updatedLog
      .filter(entry => entry.account === userId && new Date(entry.time) > runStart)
      .map(entry => entry.username);

    console.log(`🧾 Usernames unfollowed for ${data.username}:`);
    console.log(unfollowedNow.map(u => `  • @${u}`).join("\n") || "  (none)");

    stats[userId] = {
      ...(stats[userId] || {}),
      username: data.username,
      group: data.file,
      last_unfollow: now.toISOString(),
      unfollowed_count: (stats[userId]?.unfollowed_count || 0) + unfollowedNow.length,
      last_unfollowed_usernames: unfollowedNow,
      last_unfollow_result: "success"
    };

  } catch (err) {
    console.error(`❌ unfollow.js failed for ${userId}:`, err.message);
    stats[userId] = {
      ...(stats[userId] || {}),
      username: data.username,
      group: data.file,
      last_unfollow: now.toISOString(),
      unfollowed_count: stats[userId]?.unfollowed_count || 0,
      last_unfollowed_usernames: [],
      last_unfollow_result: "error"
    };
  }

  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}

console.log("✅ unfollow-runner.js done.");
