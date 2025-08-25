// helpers/scroll.js
const { delay } = require('./utils');

async function scrollFollowingList(page, maxScrolls = 10) {
  console.log('[scrollFollowingList] ⏳ Scrolling to load all following users...');
  let lastHeight = 0;

  for (let i = 0; i < maxScrolls; i++) {
    lastHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(2000);
    const newHeight = await page.evaluate(() => document.body.scrollHeight);

    if (newHeight === lastHeight) {
      console.log('[scrollFollowingList] ✅ Reached end of list.');
      break;
    }
  }

  console.log('[scrollFollowingList] ✅ Finished scrolling.');
}

module.exports = {
  scrollFollowingList
};
