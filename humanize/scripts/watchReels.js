// humanize/scripts/watchReels.js
// Reels micro-session using the humanSwipe engine (tremor, lateral, curviness, outliers, fatigue).

const { swipeNext } = require('./humanSwipe');
const { getMood } = require('../moods');
const { handleCommentsFlow } = require('../comments');

const now = () => Date.now();
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const rFloat = (a, b) => a + Math.random() * (b - a);
const rInt = (a, b) => Math.floor(rFloat(a, b + 1));

async function enableTouchEmulation(page) {
  const cdp = await page.target().createCDPSession();
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
}

async function killCommonBlockers(page) {
  const sels = [
    'div[role="dialog"] button[aria-label="Close"]',
    'div[role="dialog"] [role="button"][tabindex]:not([disabled])',
    'div[role="dialog"] button[type="button"]',
    'div[role="dialog"] [role="button"]:not([disabled])',
  ];
  for (const sel of sels) {
    try {
      const el = await page.$(sel);
      if (el) { await el.click({ delay: rInt(15, 45) }); await sleep(rInt(120, 240)); }
    } catch {}
  }
}

async function ensureReelFocused(page) {
  await page.evaluate(() => {
    const v = document.querySelector('main video[src], div[role="dialog"] video[src]');
    if (v) v.focus?.();
  });
}

async function getSafeStartPoint(page) {
  return page.evaluate(() => {
    const bad = el => !el || el.closest('[role="dialog"]');

    // Base point ~52% width, ~74% height (bottom area is more reliable for next-reel flick)
    const base = () => {
      const v = document.querySelector('main video[src], div[role="dialog"] video[src]');
      if (v) {
        const r = v.getBoundingClientRect();
        return { x: Math.round(r.left + r.width * 0.52), y: Math.round(r.top + r.height * 0.74) };
      }
      return { x: Math.round(innerWidth * 0.52), y: Math.round(innerHeight * 0.74) };
    };

    let { x, y } = base();
    const offsets = [0, -40, 40, -80, 80]; // try around the base point
    for (const dy of offsets) {
      const yy = y + dy;
      const hit = document.elementFromPoint(x, yy);
      if (!bad(hit)) { y = yy; break; }
    }

    // Clamp start to lower-mid band (62%–88%) to avoid weak/ignored gestures
    const minX = 8, maxX = Math.max(8, innerWidth - 8);
    const minY = Math.round(innerHeight * 0.62);
    const maxY = Math.round(innerHeight * 0.88);
    x = Math.min(Math.max(x, minX), maxX);
    y = Math.min(Math.max(y, minY), maxY);
    return { x, y, vh: innerHeight };
  });
}

async function likeIfPossible(page) {
  const selectors = [
    'svg[aria-label="Like"]',
    'button[aria-label="Like"]',
    'svg[height][width][role="img"][aria-label="Like"]',
  ];
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (!el) continue;
    try { await el.click({ delay: rInt(10, 60) }); return true; } catch {}
  }
  return false;
}

async function maybeGlanceComments(page) {
  const openSel  = 'svg[aria-label="Comment"], button[aria-label="Comment"]';
  const closeSel = 'div[role="dialog"] button[aria-label="Close"], svg[aria-label="Close"]';
  try {
    const btn = await page.$(openSel);
    if (!btn) return false;
    await btn.click({ delay: rInt(15, 50) });
    await sleep(rInt(350, 900));
    const close = await page.$(closeSel);
    if (close) { await close.click({ delay: rInt(15, 50) }); }
    return true;
  } catch { return false; }
}

async function maybePeekProfile(page) {
  const sel = 'header a[role="link"][href*="/"], a[role="link"] img[alt*=" profile picture"]';
  try {
    const el = await page.$(sel);
    if (!el) return false;
    await el.click({ delay: rInt(15, 45) });
    await sleep(rInt(400, 900));
    await page.keyboard.press('Escape').catch(() => {});
    return true;
  } catch { return false; }
}

function parseCompactNumber(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/[,\s]/g, '').toLowerCase();
  const m = cleaned.match(/([0-9]*\.?[0-9]+)([km])?/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (isNaN(n)) return null;
  const suf = m[2];
  if (suf === 'k') n *= 1_000;
  if (suf === 'm') n *= 1_000_000;
  return Math.round(n);
}

async function getReelLikeCount(page) {
  try {
    return await page.evaluate(() => {
      function parseNum(t) {
        if (!t) return null;
        const s = String(t).replace(/[,\s]/g, '').toLowerCase();
        const m = s.match(/([0-9]*\.?[0-9]+)([km])?/);
        if (!m) return null;
        let n = parseFloat(m[1]);
        if (isNaN(n)) return null;
        const suf = m[2];
        if (suf === 'k') n *= 1_000;
        if (suf === 'm') n *= 1_000_000;
        return Math.round(n);
      }

      const likeIcon = document.querySelector('svg[aria-label="Like"], button[aria-label="Like"], svg[aria-label="Unlike"], button[aria-label="Unlike"]');
      const candidates = new Set();
      if (likeIcon) {
        let node = likeIcon;
        for (let i = 0; i < 5 && node; i++) {
          const spans = node.querySelectorAll('span, div');
          spans.forEach(el => {
            const txt = el.textContent?.trim();
            if (txt && /[0-9]/.test(txt)) candidates.add(txt);
          });
          node = node.parentElement;
        }
      }
      // Also scan fixed counters on the right column (desktop reels layout)
      document.querySelectorAll('section, aside, nav, div').forEach(el => {
        const txt = el.textContent?.trim();
        if (txt && /\blikes?\b/i.test(txt) && /[0-9]/.test(txt)) candidates.add(txt);
      });

      let best = 0;
      for (const txt of candidates) {
        const n = parseNum(txt);
        if (n && n > best) best = n;
      }
      return best || null;
    });
  } catch {
    return null;
  }
}

async function doubleTapVideo(page) {
  try {
    const pt = await page.evaluate(() => {
      const v = document.querySelector('main video[src], div[role="dialog"] video[src]');
      if (!v) return null;
      const r = v.getBoundingClientRect();
      return { x: Math.round(r.left + r.width * 0.5), y: Math.round(r.top + r.height * 0.5) };
    });
    if (!pt) return false;

    const cdp = await page.target().createCDPSession();
    const tap = async () => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await tap();
    await new Promise(res => setTimeout(res, 120));
    await tap();
    try { await cdp.detach(); } catch {}
    return true;
  } catch (e) {
    try {
      // Fallback to mouse double click if touch fails
      const pt = await page.evaluate(() => {
        const v = document.querySelector('main video[src], div[role="dialog"] video[src]');
        if (!v) return null;
        const r = v.getBoundingClientRect();
        return { x: Math.round(r.left + r.width * 0.5), y: Math.round(r.top + r.height * 0.5) };
      });
      if (!pt) return false;
      await page.mouse.click(pt.x, pt.y, { clickCount: 2, delay: 60 });
      return true;
    } catch { return false; }
  }
}

module.exports = {
  name: 'watchReels',
  weight: 1,
  cooldownMs: 15000,
  dailyCap: 120,

  async run(page, runSeconds = 60, opts = {}) {
    const cfg = {
      dwellBuckets: [
        { range: [2, 4],  w: 1 },
        { range: [4, 7],  w: 3 },
        { range: [7, 11], w: 3 },
        { range: [11, 16], w: 2 },
        { range: [16, 24], w: 1 },
      ],
      rewatchChance: 0.06,
      likeChanceBase: 0.16,
      likeDecay: 0.92,
      commentsGlanceChance: 0.07,
      profilePeekChance: 0.05,
      tapNoiseOnce: false,
      betweenReelPauseMs: [350, 1200],
      swipeDy: null,
      maxLikes: 3,
      maxPeeks: 2,
      maxCommentsGlance: 2,
      ...opts,
    };

    const state = {
      reelsSeen: 0,
      likes: 0,
      peeks: 0,
      glances: 0,
      likeP: cfg.likeChanceBase,
      _swipeSession: {},
    };

    await sleep(rInt(500, 1400));
    await enableTouchEmulation(page);
    await killCommonBlockers(page).catch(() => {});
    await ensureReelFocused(page);

    const start = now();
    while ((now() - start) / 1000 < runSeconds) {
      const safe = await getSafeStartPoint(page).catch(() => null);
      const vp = page.viewport() || { width: 360, height: 640 };
      const h = vp.height || 640;
      const dyUp = -Math.round(h * rFloat(0.82, 0.90));

      try {
console.log('[DEBUG] Calling swipeNext with:', safe ? safe : 'no safe coords');
        await swipeNext(page, {
          ...(safe ? { startX: safe.x, startY: safe.y } : {}),
          dyRangePx: [dyUp, dyUp],
          stepsRange: [12, 18],
          durationRangeMs: [240, 420],
          tremorPxRange: [0.2, 0.8],
          session: state._swipeSession,
        });
console.log('[DEBUG] swipeNext finished');
      } catch {
        await sleep(rInt(200, 600));
      }

      state.reelsSeen++;

      // Apply mood modifiers each loop (simple, time-based)
      try {
        const mood = getMood();
        state.likeP = Math.min(0.95, cfg.likeChanceBase * mood.likeMultiplier);
        var moodDwellMultiplier = mood.dwellMultiplier || 1.0;
        var moodName = mood.name || 'Default';
      } catch { var moodDwellMultiplier = 1.0; var moodName = 'Default'; }

      // Heuristic: boost dwell and like chance for highly-liked reels
      let dwellBoost = 1;
      try {
        const likeCount = await getReelLikeCount(page);
        if (process.env.REELS_DEBUG === '1') {
          console.log(`[Reel] likeCount=${likeCount ?? 'n/a'} mood=${moodName}`);
        }
        if (likeCount && likeCount >= 150_000) {
          dwellBoost = 1.35; // watch longer
          state.likeP = Math.min(0.95, state.likeP * 1.5); // +50%
          console.log(`[ReelsHeuristic] High-like reel detected (${likeCount}). likeP=${state.likeP.toFixed(3)} dwellBoost=${dwellBoost}`);
        }
      } catch {}

      if (state.likes < cfg.maxLikes && Math.random() < state.likeP) {
        let didLike = await likeIfPossible(page);
        if (!didLike) didLike = await doubleTapVideo(page);
        if (didLike) state.likes++;
        state.likeP *= cfg.likeDecay;
      }
      if (state.glances < cfg.maxCommentsGlance && Math.random() < cfg.commentsGlanceChance) {
        if (await maybeGlanceComments(page)) state.glances++;
      }
      if (state.peeks < cfg.maxPeeks && Math.random() < cfg.profilePeekChance) {
        if (await maybePeekProfile(page)) state.peeks++;
      }

      await sleep(rInt(cfg.betweenReelPauseMs[0], cfg.betweenReelPauseMs[1]));
      if ((now() - start) / 1000 >= runSeconds) break;

      const bucket = (() => {
        const total = cfg.dwellBuckets.reduce((s, b) => s + b.w, 0);
        let roll = Math.random() * total;
        for (const b of cfg.dwellBuckets) {
          if ((roll -= b.w) <= 0) return b.range;
        }
        return cfg.dwellBuckets[cfg.dwellBuckets.length - 1].range;
      })();
      const baseDwell = rInt(bucket[0], bucket[1]);
      const dwell = Math.max(1, Math.round(baseDwell * dwellBoost * moodDwellMultiplier));
      if (process.env.REELS_DEBUG === '1') {
        console.log(`[Reel] mood=${moodName} likeP=${state.likeP.toFixed(3)} dwell=${dwell}s`);
      }
      await sleep(rInt(dwell * 250, dwell * 350));

      // Comments module (per doc)
      try {
        const commentsResult = await handleCommentsFlow(page, {
          lastReelLiked: state.likes > 0, // coarse signal for this session
          mood: getMood(),
        });
        if (commentsResult?.opened) {
          console.log(`[Comments] opened=true scrolled=${commentsResult.scrolled} liked=${commentsResult.commentLikes}`);
        }
      } catch {}
    }

    return {
      ok: true,
      reelsSeen: state.reelsSeen,
      likes: state.likes,
      peeks: state.peeks,
      glances: state.glances,
      durationSec: Math.round((now() - start) / 1000),
    };
  },
};
