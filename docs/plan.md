## IG Automation – Implementation Plan

### Goal
Self‑sustaining Instagram automation with strong humanization. Start with Reels (watch/like heuristics), then comments (open/scroll/like), then profile exploration, moods/time‑of‑day, and runner integration.

### Current status (done)
- Local env working with AdsPower (API 50325). Profile `k12im9s3` logged in.
- Follow/unfollow flows verified. Unfollow has robust fallback (direct URL).
- Reels swiping works; heuristic added for high‑like reels (≥150k) to boost dwell and like probability (+50%).
- README added.

### Architecture overview (key modules)
- `actions/` – concrete IG actions (follow, unfollow, search).
- `helpers/` – AdsPower connect, files I/O, navigation, scroll, utils.
- `humanize/scripts/watchReels.js` – session controller for Reels.
- `humanize/scripts/humanSwipe.js` – low‑level swipe (CDP touch events).
- `runner.js`, `unfollow-runner.js` – schedulers.
- `config.js`, `mapping.json` – constants and profile→targets mapping.

### Milestones & acceptance

1) Reels hardening (in progress)
- Tasks:
  - Keep swipes in viewport; maintain human path/tremor.
  - Heuristic: if likes ≥ 150k → increase dwell and like chance by +50%.
- Acceptance:
  - 20+ consecutive swipes without miss; console shows heuristic logs when triggered.
  - Command: `node humanize/run.js k12im9s3 90`.

2) Comments module (Reels context)
- Tasks:
  - Open comments with probabilities: base 2%; +6% if reel was liked; +12% if `comments > likes/100`.
  - Scroll comments dialog: chances 75% → 25% → 12.5% → 6.25%; waits 0.2–8s (weighted ~2s) + rare 60–120s.
  - Like visible comments: 4% per comment; human pause 0.8–10s (weighted ~2.2s) + rare 60–240s.
- Acceptance:
  - Probabilities respected within ±10% in logs; swipes scoped to comments dialog; likes have human delay.

3) Profile exploration
- Tasks:
  - Commenter profile open: 0.5% base, 12% if that comment was liked.
  - Public/private detection; back/stay logic.
  - Posts: 50% open; 40% like; 10% open comments (reuse comment scrolling logic). 50% chance to open next post repeatedly until stop/no posts.
  - Followers/Following: 7.5% each.
  - Highlights: 40% open random group; step‑down advance 80→70→60→50→40→10→5% (repeat 5%) with 2–8s per story.
  - Active story: 90% open; 0.8–10s per story (weighted ~3.4s) until done.
  - Return chain: from nested profile → back to first visited profile (0.8–2.8s weighted 1.2) → back to reels.
  - Global freeze: 0.1% chance per action → pause 10–300s (weighted ~110s).
- Acceptance: all paths reachable; logs show decisions and wait times; safe return to Reels.

4) Moods / time‑of‑day engine
- Tasks:
  - Implement modifiers for MorningChill, MorningCoffeeScroll, LunchtimeBrowse, AfternoonDistraction, EveningRelax, NightOwlStalker.
  - WeekendFrenzy override (Fri/Sat 20:00–04:00).
  - Apply to probabilities and waits; cap at 100%.
- Acceptance: mood switching reflected in logs; weekend override supersedes other moods.

5) Runner integration, caps, telemetry
- Tasks:
  - Optionally run micro Reels sessions between follow cycles with daily caps per profile.
  - Centralized logs: decisions, waits, actions; per‑profile counters in `account_stats.json` and `logs/reels.json`.
- Acceptance: flags to enable/disable; caps enforced; stats persisted.

### Config surfaces (to add as needed)
- `humanize/config.json` or environment variables for probabilities, caps, mood weights.
- Per‑profile overrides via `mapping.json` extensions (optional later).

### Risks & mitigations
- IG UI changes → keep selector fallbacks and direct URL fallbacks.
- Rate/behavior limits → daily caps, randomized waits, moods engine.
- Secrets in repo → remove hardcoded OpenAI key in `read-csv-filter.js`; use `.env`.

### Estimates (rough)
- Reels hardening + heuristic: 0.5–1 day (core in place).
- Comments module: 1–1.5 days.
- Profile exploration: 2–3 days.
- Moods engine: 0.5–1 day.
- Runner integration + telemetry: 0.5–1 day.

### Validation commands
- Reels: `node humanize/run.js <PROFILE_ID> 90`
- Follow: `node main.js <PROFILE_ID> 5`
- Unfollow: `node unfollow.js <PROFILE_ID> 5`


