// humanize/selectors.js
// Minimal, syntactically valid, and robust-ish selectors for IG Reels flows.

module.exports = {
  targets: {
    // Reels entry points / containers
    reelsTab: { css: 'a[role="link"][href*="/reels/"], svg[aria-label="Reels"]' },
    reelVideo: { css: 'main video[src], div[role="dialog"] video[src]' },

    // Like / Unlike
    like:  { css: 'svg[aria-label="Like"], button[aria-label="Like"]' },
    liked: { css: 'svg[aria-label="Unlike"], button[aria-label="Unlike"]' },

    // Comments open/close
    comment: {
      open:  { css: 'svg[aria-label="Comment"], button[aria-label="Comment"]' },
      close: { css: 'div[role="dialog"] button[aria-label="Close"], svg[aria-label="Close"]' },
    },

    // Profile peek / avatar (approximate)
    profileFromReel: { css: 'header a[role="link"][href*="/"], a[role="link"] img[alt*=" profile picture"]' },

    // Navigation / back buttons (fallbacks)
    backFromComments: { css: 'div[role="dialog"] button[aria-label="Close"], svg[aria-label="Close"]' },
    backFromReel:     { css: 'a[role="button"][href], svg[aria-label="Back"]' },
    backToFeed:       { css: 'a[role="link"][href="/"]' },
  },
};
