import fs from 'fs';
import path from 'path';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // ✅ pulled from .env
});

const UNFILTERED_DIR = './targets/targets(unfiltered)';
const FILTERED_DIR = './targets/targets(filtered)';
const LOG_FILES = [
  './logs/followed.txt',
  './logs/unfollowed.txt',
];

const removeQuotes = (text) => text.replace(/^"|"$/g, '').trim();

const getGender = async (username, fullName) => {
  const prompt = `
You are a strict gender classifier.

Given a social media username and full name, respond with exactly one word: "male", "female", or "unknown".

1. First, determine gender from the full name.
2. If full name is missing or unclear, check the username:
   - Look for known male names (e.g., john, mark, alex)
   - Look for masculine words (e.g., boy, king, beast, dragon, cowboy, etc.)

If none of these clearly indicate gender, respond: unknown.

Your response must be exactly one word.

Username: ${username}
Full name: ${fullName || 'N/A'}
`.trim();

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    });

    const reply = res.choices[0].message.content.trim().toLowerCase();
    return ['male', 'female'].includes(reply) ? reply : 'unknown';
  } catch (err) {
    console.error(`❌ OpenAI error for @${username}:`, err.message);
    return 'unknown';
  }
};

const isDuplicate = (username, targetFile) => {
  const files = [...LOG_FILES, targetFile];
  return files.some(file => {
    if (!fs.existsSync(file)) return false;
    const content = fs.readFileSync(file, 'utf8').toLowerCase();
    return content.includes(username.toLowerCase());
  });
};

const processFile = async (fileName) => {
  const groupName = fileName.split('-')[0];
  const inputPath = path.join(UNFILTERED_DIR, fileName);
  const outputPath = path.join(FILTERED_DIR, `${groupName}.txt`);

  let lines = fs.readFileSync(inputPath, 'utf8').split('\n');
  const headers = lines[0];
  lines = lines.slice(1); // remove header

  while (lines.length > 0) {
    const line = lines[0];
    const values = line.split(';').map(removeQuotes);

    const headerKeys = headers.split(';').map(removeQuotes).map(h => h.toLowerCase());
    const row = {};
    headerKeys.forEach((h, i) => row[h] = values[i]);

    const username = row['username'];
    const fullName = row['full_name'];

    if (!username) {
      lines.shift(); // remove this line from memory
      fs.writeFileSync(inputPath, [headers, ...lines].join('\n'));
      continue;
    }

    const gender = await getGender(username, fullName);

    if (gender === 'male' && !isDuplicate(username, outputPath)) {
      fs.appendFileSync(outputPath, `@${username}\n`);
      console.log(`✅ Added @${username} → ${groupName}.txt`);
    } else {
      console.log(`⛔ @${username} → ${gender} (skipped or duplicate)`);
    }

    // ⛔ REMOVE the processed line from file
    lines.shift(); // removes the first line that was just processed
    fs.writeFileSync(inputPath, [headers, ...lines].join('\n'));
  }
};

const runAllGroups = async () => {
  const files = fs.readdirSync(UNFILTERED_DIR).filter(f => f.endsWith('-un.csv'));
  for (const file of files) {
    console.log(`\n📂 Now processing: ${file}`);
    await processFile(file);
  }

  console.log('\n✅ All groups processed.');
};

runAllGroups();
