## IG Automation

Backend-only Node.js project that automates Instagram actions (mother–slave follow/unfollow method) with human-like behavior. Uses AdsPower browser profiles + Puppeteer for session control and humanized gestures. Includes a Reels micro-session engine with realistic swipes.

### Overview
- Mother–slave method with a target ratio of 9:1.
- Core flows: follow, unfollow, reels watching (with human-like swipes), and planned expansion into comments and profile exploration.
- Absolute priority: actions must look human (randomized timings, curved swipe paths, pauses, decision probabilities).

### Prerequisites
- Windows, PowerShell
- Node.js 18+ and npm
- AdsPower installed, Local API enabled (default port `50325`), at least one profile logged into Instagram.

### Install & Configure
1) Install AdsPower and enable Local API
- Download: `https://www.adspower.com/download`
- In AdsPower: Settings → enable Local API (note port)
- Verify port:
```powershell
Test-NetConnection -ComputerName localhost -Port 50325
```

2) Create a profile and log into Instagram
- In AdsPower, create/open a profile → open its browser → log into `https://www.instagram.com/` (complete 2FA). Close; session is saved.
- Copy its `user_id` from AdsPower (Profiles list → right‑click → Copy user_id).
  - Or via API:
```powershell
Invoke-WebRequest "http://localhost:50325/api/v1/user/list?page=1&page_size=100" | Select-Object -Expand Content
```

3) Install Node deps
```powershell
cd C:\Users\JMS\Desktop\ig-automation
npm install
```

4) Prepare targets and mapping
```powershell
New-Item -ItemType Directory -Force "targets\targets(filtered)" | Out-Null
'@exampleuser1','@exampleuser2','@exampleuser3' -join "`r`n" | Out-File -Encoding utf8 "targets\targets(filtered)\group01.txt"
notepad .\mapping.json
```
Add an entry like:
```json
{
  "YOUR_PROFILE_ID": { "username": "yourIgUsername", "file": "group01.txt" }
}
```

5) If AdsPower port ≠ `50325`, update `config.js`
```powershell
notepad .\config.js
```
Set `ADSPOWER_API_PORT` accordingly.

### Commands
- Follow N users from the mapped group:
```powershell
node main.js YOUR_PROFILE_ID 10
```
- Unfollow M users previously followed by this tool:
```powershell
node unfollow.js YOUR_PROFILE_ID 5
```
- Follow scheduler (randomized limits + cooldowns):
```powershell
node runner.js
```
- Unfollow scheduler (randomized limits + cooldowns):
```powershell
node unfollow-runner.js
```
- Reels swiping demo (mobile-like human swipes for 120s):
```powershell
node humanize/run.js YOUR_PROFILE_ID 120
```

### Project Structure (key files)
- `main.js`: follow flow runner (uses `mapping.json`, reads targets, logs to `logs/followed.json`).
- `unfollow.js`: unfollow flow (opens profile → Following list → unfollows; logs to `logs/unfollowed.json`).
- `runner.js`, `unfollow-runner.js`: schedulers with cooldowns and randomized limits.
- `helpers/adsPower.js`: connects Puppeteer to AdsPower profile via WS.
- `actions/*`: follow/unfollow/search behaviors.
- `humanize/scripts/watchReels.js`: session controller for reels (like/peek/comment-glance probabilities).
- `humanize/scripts/humanSwipe.js`: low-level swipe engine (CDP touch events, curved paths, tremor).
- `targets/targets(filtered)/*.txt`: grouped username lists consumed by `main.js`.
- `mapping.json`: maps AdsPower `user_id` → `{ username, file }`.
- `config.js`: constants (paths, selectors, AdsPower port).

### Current Capabilities
- Follow/unfollow with logs and runners.
- Reels micro-session engine that swipes with human-like gestures; optional likes/peeks.

### Planned Enhancements (initial tasks)
- Task A: Reels swipe reliability + “big-like” heuristic
  - Clamp/validate swipe coordinates; no off-screen/negative paths.
  - If reel likes > 150k: increase dwell time and boost like probability by +50% (e.g., 6% → 9%).
  - Instrument decisions (dwell/like) for tuning.

- Task B: Moods/time-of-day engine
  - MorningChill, MorningCoffeeScroll, LunchtimeBrowse, AfternoonDistraction, EveningRelax, NightOwlStalker.
  - WeekendFrenzy override (Fri/Sat 20:00–04:00). Apply modifiers to probabilities/waits (cap at 100%).

- Task C: Comments module
  - Open comments chance: base 2%; +6% if liked; +12% if `comments > likes/100`.
  - Scroll dialog with decays: 75% → 25% → 12.5% → 6.25%; waits 0.2–8s (weighted ~2s) with rare 60–120s.
  - Like visible comments: 4% each; human pause 0.8–10s (weighted ~2.2s) with rare 60–240s.

Subsequent: profile exploration (public/private, posts/likes/comments, followers/following, highlights/stories, return chain, global 0.1% freeze per action).

### Security Notes
- `read-csv-filter.js` currently contains a hardcoded OpenAI API key. Do not run it. We will migrate to environment variables and rotate any exposed keys.

### Troubleshooting
- IG not logged in: open the AdsPower profile’s browser and log in once; rerun.
- Can’t connect to AdsPower: verify port with `Test-NetConnection`; update `ADSPOWER_API_PORT` in `config.js` if needed.
- UI selectors failing: Instagram UI may have changed; update selectors in `actions/*` or `helpers/*`.

### Disclaimer
Automation may violate Instagram’s ToS and can risk account restrictions. Use responsibly.


