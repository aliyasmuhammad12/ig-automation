// humanize/scripts/humanSwipe.js
// Export: { swipeNext(page, options) }

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const rFloat = (a, b) => a + Math.random() * (b - a);
const rInt = (a, b) => Math.floor(rFloat(a, b + 1));
const lerp = (a, b, t) => a + (b - a) * t;

// Small easing so the flick starts fast and eases out
function easeOutExpo(t) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

async function withCDP(page, fn) {
  const client = await page.target().createCDPSession();
  // Ensure touch is truly “mobile-like”
  await client.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 1,
  });
  try {
    return await fn(client);
  } finally {
    try { await client.detach(); } catch {}
  }
}

// Build a curved, slightly noisy path
function buildPath(opts) {
  const {
    vw, vh,
    startX, startY,
    dyRangePx = [-Math.round((vh || 640) * 0.85), -Math.round((vh || 640) * 0.85)],
    stepsRange = [12, 18],
    durationRangeMs = [240, 420],
    tremorPxRange = [0.2, 0.8],
    lateralDriftPx = [ -6, 6 ],
  } = opts;

  const steps = rInt(stepsRange[0], stepsRange[1]);
  const duration = rInt(durationRangeMs[0], durationRangeMs[1]);
  const tremorMin = tremorPxRange[0], tremorMax = tremorPxRange[1];

  const dy = rInt(dyRangePx[0], dyRangePx[1]);
  const endX = clamp(startX + rInt(lateralDriftPx[0], lateralDriftPx[1]), 8, vw - 8);
  const endYRaw = startY + dy;

  // Don’t let endY go off-screen; IG often ignores off-screen end points
  const endY = clamp(endYRaw, Math.round(vh * 0.08), vh - 12);

  const path = [];
  for (let i = 0; i <= steps; i++) {
    const t = easeOutExpo(i / steps);
    let x = lerp(startX, endX, t);
    let y = lerp(startY, endY, t);

    // Gentle tremor
    x += rFloat(-tremorMax, tremorMax);
    y += rFloat(-tremorMax, tremorMax);

    // Final clamp to viewport
    x = clamp(Math.round(x), 2, vw - 2);
    y = clamp(Math.round(y), 2, vh - 2);

    path.push({ x, y });
  }
  return { path, duration };
}

async function dispatchSwipe(client, path, durationMs) {
  if (!path.length) return;
  const id = 1;

  // TouchStart
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: path[0].x, y: path[0].y, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 0.85, id }],
    modifiers: 0,
  });

  // Moves
  const moves = path.slice(1, -1);
  const perStepDelay = Math.max(6, Math.round(durationMs / Math.max(2, moves.length)));
  for (const p of moves) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: p.x, y: p.y, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 0.75, id }],
      modifiers: 0,
    });
    // micro-delay between moves; keep it short so it feels like a flick
    await new Promise(r => setTimeout(r, perStepDelay));
  }

  // TouchEnd
  const last = path[path.length - 1];
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [], // end ends with empty list
    modifiers: 0,
  });
}

/**
 * swipeNext(page, options)
 * options:
 *  - startX, startY : optional start point; if missing, uses 52% x, 74% y of reel/video box or viewport
 *  - dyRangePx, stepsRange, durationRangeMs, tremorPxRange, session : optional shaping
 */
async function swipeNext(page, options = {}) {
  // Derive viewport
  const vp = page.viewport() || { width: 360, height: 640, isMobile: true, hasTouch: true };
  const vw = vp.width || 360;
  const vh = vp.height || 640;

  // Try to start over the video region if possible (safer on IG)
  let startX = options.startX, startY = options.startY;
  if (typeof startX !== 'number' || typeof startY !== 'number') {
    try {
      const pt = await page.evaluate(() => {
        const v = document.querySelector('main video[src], div[role="dialog"] video[src]');
        if (v) {
          const r = v.getBoundingClientRect();
          return {
            x: Math.round(r.left + r.width * 0.52),
            y: Math.round(r.top + r.height * 0.74),
          };
        }
        return { x: Math.round(innerWidth * 0.52), y: Math.round(innerHeight * 0.74) };
      });
      startX = pt.x; startY = pt.y;
    } catch {
      startX = Math.round(vw * 0.52);
      startY = Math.round(vh * 0.74);
    }
  }

  // Final clamp for start point (avoid nav bars/edges)
  startX = clamp(Math.round(startX), 8, vw - 8);
  startY = clamp(Math.round(startY), Math.round(vh * 0.12), vh - 24);

  const { path, duration } = buildPath({
    vw, vh,
    startX, startY,
    dyRangePx: options.dyRangePx,
    stepsRange: options.stepsRange,
    durationRangeMs: options.durationRangeMs,
    tremorPxRange: options.tremorPxRange,
  });

  // Run with CDP
  return withCDP(page, async (client) => {
    // Bring page to front & ensure focus helps IG accept the gesture
    try { await client.send('Page.bringToFront'); } catch {}
    try {
      await page.evaluate(() => {
        const v = document.querySelector('main video[src], div[role="dialog"] video[src]');
        v?.focus?.();
      });
    } catch {}

    await dispatchSwipe(client, path, duration);
  });
}

module.exports = { swipeNext };
