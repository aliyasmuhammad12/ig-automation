const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const MAPPING_FILE = path.join(__dirname, "mapping.json");
const STATS_FILE = path.join(__dirname, "account_stats.json");
const MAIN_SCRIPT = "main.js"; // 👈 use new entry point
const COOLDOWN_HOURS = 6;
const FOLLOW_RANGE = { min: 5, max: 10 };

function hoursSince(lastRun) {
  if (!lastRun) return Infinity;
  return (new Date() - new Date(lastRun)) / (1000 * 60 * 60);
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Load mapping + stats
if (!fs.existsSync(MAPPING_FILE)) {
  console.error("❌ Missing mapping.json");
  process.exit(1);
}

const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, "utf-8"));
const stats = fs.existsSync(STATS_FILE)
  ? JSON.parse(fs.readFileSync(STATS_FILE, "utf-8") || "{}")
  : {};

const now = new Date();

// Filter accounts ready to run
const readyAccounts = Object.entries(mapping).filter(([id]) => {
  const lastRun = stats[id]?.last_run;
  return !lastRun || hoursSince(lastRun) > COOLDOWN_HOURS;
});

shuffleArray(readyAccounts);

if (readyAccounts.length === 0) {
  console.log("⏳ No accounts are ready. Try later.");
  process.exit(0);
}

// 🔁 LOOP over each ready account
for (const [userId, data] of readyAccounts) {
  const FOLLOW_LIMIT = getRandomInt(FOLLOW_RANGE.min, FOLLOW_RANGE.max);
  console.log(`🚀 Running ${MAIN_SCRIPT} for ${userId} (${data.username}) with FOLLOW_LIMIT=${FOLLOW_LIMIT}`);

  try {
    execSync(`node ${MAIN_SCRIPT} ${userId} ${FOLLOW_LIMIT}`, { stdio: "inherit" });

    stats[userId] = {
      username: data.username,
      group: data.file,
      last_run: now.toISOString(),
      followed_count: (stats[userId]?.followed_count || 0) + FOLLOW_LIMIT,
      last_result: "success"
    };
  } catch (err) {
    console.error(`❌ ${MAIN_SCRIPT} failed for ${userId}:`, err.message);
    stats[userId] = {
      username: data.username,
      group: data.file,
      last_run: now.toISOString(),
      followed_count: stats[userId]?.followed_count || 0,
      last_result: "error"
    };
  }

  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}

console.log("✅ runner.js done.");
