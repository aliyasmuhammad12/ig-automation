const fs = require('fs');
const path = require('path');

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`❌ Failed to read JSON from ${filePath}:`, err.message);
    return null;
  }
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`❌ Failed to write JSON to ${filePath}:`, err.message);
  }
}

function readUsernames(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8')
      .split('\n')
      .map(u => u.trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean);
  } catch (err) {
    console.error(`❌ Failed to read usernames from ${filePath}:`, err.message);
    return [];
  }
}

function writeUsernames(filePath, usernames) {
  try {
    const withAt = usernames.map(u => u.startsWith('@') ? u : '@' + u);
    fs.writeFileSync(filePath, withAt.join('\n'));
  } catch (err) {
    console.error(`❌ Failed to write usernames to ${filePath}:`, err.message);
  }
}


function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

module.exports = {
  readJSON,
  writeJSON,
  readUsernames,
  writeUsernames,
  ensureDirectory
};


