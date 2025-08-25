const { swipeNext } = require('./scripts/humanSwipe');

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const rFloat = (a, b) => a + Math.random() * (b - a);
const rInt = (a, b) => Math.floor(rFloat(a, b + 1));

function pickWeighted(min, max, heavyAtSeconds) {
  // Triangular-like around heavyAtSeconds
  const mid = heavyAtSeconds;
  const a = min, c = max;
  const rand = Math.random();
  // 50% around mid ± 30%
  if (rand < 0.5) {
    const lo = Math.max(a, mid * 0.7);
    const hi = Math.min(c, mid * 1.3);
    return rFloat(lo, hi);
  }
  // Otherwise full range
  return rFloat(a, c);
}

async function getCounts(page) {
  // Returns { likes, comments } best-effort
  try {
    return await page.evaluate(() => {
      function parseNum(t) {
        if (!t) return 0;
        const s = String(t).replace(/[,\s]/g, '').toLowerCase();
        const m = s.match(/([0-9]*\.?[0-9]+)([km])?/);
        if (!m) return 0;
        let n = parseFloat(m[1]);
        if (isNaN(n)) return 0;
        if (m[2] === 'k') n *= 1_000;
        if (m[2] === 'm') n *= 1_000_000;
        return Math.round(n);
      }

      let likes = 0, comments = 0;
      // Try reading counters near action buttons in reels UI
      document.querySelectorAll('section, aside, nav, div').forEach(el => {
        const txt = el.textContent || '';
        if (/\blikes?\b/i.test(txt)) likes = Math.max(likes, parseNum(txt));
        if (/\bcomments?\b|\bcomment\b/i.test(txt)) comments = Math.max(comments, parseNum(txt));
      });
      return { likes, comments };
    });
  } catch { return { likes: 0, comments: 0 }; }
}

async function ensureCommentsOpen(page) {
  const openSel = 'svg[aria-label="Comment"], button[aria-label="Comment"]';
  const closeSel = 'div[role="dialog"] button[aria-label="Close"], svg[aria-label="Close"]';
  try {
    const already = await page.$('div[role="dialog"]');
    if (already) return { opened: true, closeSel };
    const btn = await page.$(openSel);
    if (!btn) return { opened: false };
    await btn.click({ delay: rInt(15, 45) });
    await sleep(rInt(250, 600));
    await page.waitForSelector('div[role="dialog"]', { visible: true, timeout: 5000 });
    return { opened: true, closeSel };
  } catch { return { opened: false }; }
}

async function closeComments(page) {
  const closeSel = 'div[role="dialog"] button[aria-label="Close"], svg[aria-label="Close"]';
  try {
    const el = await page.$(closeSel);
    if (el) await el.click({ delay: rInt(10, 40) });
  } catch {}
}

async function getDialogStartPoint(page) {
  // Bottom third of dialog for swipe start
  return await page.evaluate(() => {
    const dlg = document.querySelector('div[role="dialog"]');
    if (!dlg) return null;
    const r = dlg.getBoundingClientRect();
    const x = Math.round(r.left + r.width * 0.5);
    const y = Math.round(r.top + r.height * 0.82);
    return { x, y, vh: window.innerHeight };
  });
}

async function swipeCommentsOnce(page) {
  const start = await getDialogStartPoint(page);
  if (!start) return false;
  try {
    await swipeNext(page, {
      startX: start.x,
      startY: start.y,
      dyRangePx: [-Math.round((start.vh || 640) * 0.40), -Math.round((start.vh || 640) * 0.55)],
      stepsRange: [16, 24],
      durationRangeMs: [420, 680],
      tremorPxRange: [0.2, 0.7],
    });
    return true;
  } catch { return false; }
}

async function likeVisibleComments(page, mood) {
  const likeP = 0.04 * (mood?.likeMultiplier || 1);
  const extremeP = 0.005;
  let likes = 0;
  try {
    const commentLikeSelectors = [
      'div[role="dialog"] svg[aria-label="Like"], div[role="dialog"] button[aria-label="Like"]',
    ];
    const nodes = await page.$$(commentLikeSelectors[0]);
    for (const el of nodes) {
      if (Math.random() < likeP) {
        // human pause
        let waitSec = pickWeighted(0.8, 10, 2.2);
        if (Math.random() < extremeP) waitSec = rFloat(60, 240);
        await sleep(waitSec * 1000);
        try { await el.click({ delay: rInt(20, 60) }); likes++; } catch {}
      }
    }
  } catch {}
  return likes;
}

async function handleCommentsFlow(page, ctx) {
  const { lastReelLiked, mood } = ctx || {};
  const { likes, comments } = await getCounts(page);

  // Decision to open
  let openP = 0.02;
  if (lastReelLiked) openP += 0.06;
  if (comments > 0 && likes > 0 && comments > Math.floor(likes / 100)) openP += 0.12;
  // Apply mood modifier
  openP *= (mood?.glanceMultiplier ?? 1);
  openP = Math.min(1, Math.max(0, openP));

  // Test override: open comments once deterministically when env var is set
  if ((process.env.COMMENTS_FORCE_OPEN || '').trim() === '1') {
    openP = 1;
    console.log('[Comments][TEST] Force-open enabled via COMMENTS_FORCE_OPEN=1');
  }

  if (Math.random() >= openP) return { opened: false, scrolled: 0, commentLikes: 0 };

  const open = await ensureCommentsOpen(page);
  if (!open.opened) return { opened: false, scrolled: 0, commentLikes: 0 };

  // Scroll sequence: 75% -> 25% -> 12.5% -> 6.25%
  const chances = [0.75, 0.25, 0.125, 0.0625];
  let scrolled = 0;
  for (const baseP of chances) {
    let p = baseP * (mood?.glanceMultiplier || 1);
    if (Math.random() < p) {
      // wait between swipes 0.2–8s heavy at ~2s; rare 0.3% 60–120s
      let waitSec = pickWeighted(0.2, 8, 2);
      if (Math.random() < 0.003) waitSec = rFloat(60, 120);
      await sleep(waitSec * 1000);
      await swipeCommentsOnce(page);
      scrolled++;
    } else {
      break;
    }
  }

  const commentLikes = await likeVisibleComments(page, mood);
  await closeComments(page);
  return { opened: true, scrolled, commentLikes };
}

module.exports = { handleCommentsFlow };


