# Smart Runner v1

Intelligent Instagram automation runner with pod management, mood-based scheduling, and elastic cadence.

## Features

- **Pod Management**: 5 accounts per pod with intelligent rotation
- **Global Concurrency**: Only one session running at any time
- **Smart Scheduling**: 15-60min idle spacing with burst capability
- **Mood-Based Behavior**: Different activity weights by time of day
- **Fluid Rarity**: Stories rarity depends on daily activity, not hard caps
- **Recovery System**: Multi-step recovery for failed sessions
- **Local Database**: JSON-based state tracking and event logging

## Quick Start

### 1. Install Dependencies

```bash
cd smart-runner
npm install
```

### 2. Configure Pods

Edit `data/runner-groups.json` to set your AdsPower profile IDs:

```json
{
  "pods": [
    {
      "pod": "podA",
      "profiles": [
        "your_profile_1",
        "your_profile_2",
        "your_profile_3",
        "your_profile_4",
        "your_profile_5"
      ]
    }
  ]
}
```

### 3. Configure Settings

Edit `config/smart-runner.json` to adjust:
- Burst probability (how often to run twice in ~30s)
- Unfollow threshold (when to include unfollow activities)
- Activity weights (follow, unfollow, reels, stories)
- Recovery settings

### 4. Run with PM2

```bash
# Start podA
pm2 start ecosystem.config.js

# Monitor
pm2 logs smart-runner-podA

# Stop
pm2 stop smart-runner-podA
```

### 5. Manual Testing

```bash
# Test single pod
node smart-runner.js --pod podA
```

## Configuration

### Smart Runner Config (`config/smart-runner.json`)

- `concurrency`: Global concurrency limit (always 1)
- `idle`: Base idle spacing (15-60 minutes)
- `handoff`: Log-normal jitter between accounts
- `bursts`: Burst capability settings
- `weights`: Base activity weights
- `unfollowTrigger`: When to include unfollow activities
- `storiesPolicy`: Fluid rarity settings
- `recovery`: Recovery flow settings

### Moods Config (`config/moods.json`)

Defines time-based behavior multipliers:
- **MorningRush** (07:00-11:00): Shorter gaps, more bursts
- **DayDrift** (11:00-17:00): Normal behavior, more reels
- **EveningSpree** (17:00-22:30): Longer gaps, more reels/stories
- **LateNightLurk** (22:30-01:00): Longer gaps, more unfollows
- **Sleep** (01:00-07:30): No activity

## Database Schema

### runner_state.json
Per-account state tracking:
- `profileId`, `pod`, `timezone`
- `lastActiveAt`, `startsToday`, `energy`
- `nextEligibleAt`, `storiesLastAt`
- `flags`, `cursors`, `errorStreak`

### runner_events.json
Event logging:
- `ts`, `pod`, `profileId`, `sessionId`
- `event`, `type`, `params`, `outcome`
- `durMs`, `mood`, `daypart`

### runner_summaries.json
Daily rollups (optional)

## Child Process Contracts

The runner spawns your existing scripts with these arguments:

- **Follow**: `follow.js --profile <id> --count <n>`
- **Unfollow**: `unfollow.js --profile <id> --count <n>`
- **Reels**: `reels.js --profile <id> --seconds <s>`
- **Stories**: `stories.js --profile <id> --seconds <s>`

## Monitoring

### Logs
- PM2 logs: `pm2 logs smart-runner-podA`
- Event logs: `data/runner_events.json`
- State logs: `data/runner_state.json`

### Skip Reasons
Every "nothing happened" tick logs a skip reason:
- `sleepWindow`: Inside sleep window
- `notEligible`: Idle spacing not complete
- `concurrency`: Global semaphore busy
- `noTargets`: No follow targets available
- `unfollowNotDue`: Unfollow threshold not reached
- `storiesTooSoon`: Stories run too recently
- `burstDenied`: Burst opportunity denied
- `energyLow`: Account energy too low

## Tuning

### Hot Knobs (configurable without code changes)
- `bursts.probability`: How often immediate second sessions happen
- `unfollowTrigger.threshold`: When to include unfollow activities
- `storiesPolicy.rarityBias`: How aggressively to down-weight stories
- `weights.base`: Activity weight adjustments

### Energy System
- Starts at 100, decreases by 10 per session
- Slowly recharges when idle
- Affects burst probability

## Recovery Flow

On hard errors, the runner attempts recovery:
1. Return to app home
2. Back navigation
3. Refresh/reopen profile
4. Reopen app if available
5. Reopen AdsPower profile (last resort)

If recovery fails, the account is marked as `needsRecovery` and rotation continues.

## Architecture

```
Smart Runner
├── Config Files (smart-runner.json, moods.json)
├── Database (JSON files)
├── Planner (activity selection with mood multipliers)
├── Runner Loop (global semaphore, account rotation)
├── Child Process Manager (spawns existing scripts)
├── Recovery System (multi-step error recovery)
└── Event Logger (comprehensive logging)
```

## Troubleshooting

### Common Issues
1. **No sessions starting**: Check skip reasons in logs
2. **Recovery loops**: Check AdsPower profile status
3. **High error rates**: Adjust recovery settings or check network

### Debug Mode
Add `--debug` flag for verbose logging (if implemented).

## License

MIT
