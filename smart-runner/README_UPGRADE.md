# Smart Runner v1 Upgrade: Daily Session Orchestrator + Home Feed Scroller

## 🎯 Overview

This upgrade adds a sophisticated **Daily Session Orchestrator** and **Home Feed Scroller** to Smart Runner v1, implementing multi-session realism and scarcity-aware behavior as specified by the client.

## 🏗️ Architecture

### New Components

1. **Daily Session Orchestrator** (`modules/DailySessionOrchestrator.js`)
   - Session gating logic (min gap, freshness gate, fatigue throttle)
   - Session shape selection based on daypart and history
   - Cross-session memory management
   - Daily budgeting and risk tier management

2. **Home Feed Scroller** (`modules/HomeFeedScroller.js`)
   - Scarcity detection (Followed vs Suggested ratio)
   - Content type detection (Followed/Suggested/Ads)
   - Session shape execution (MC, CS, DR, SB, CR)
   - Natural exit conditions ("Caught Up", caps, boredom)

3. **Content Type Detector** (`modules/ContentTypeDetector.js`)
   - DOM analysis for Followed/Suggested/Ad posts
   - "Caught Up" detection
   - Scarcity calculation
   - Safe zone detection for interactions

4. **Session Memory** (`modules/SessionMemory.js`)
   - Cross-session state persistence
   - Last seen post IDs (ring buffer)
   - Like window tracking (last 5 posts)
   - Familiar accounts cache (72h)
   - Scarcity observations history

5. **Like Rate Calculator** (`modules/LikeRateCalculator.js`)
   - Mood-based like rate calculation
   - Content type-specific rates
   - Global gates application (anti-streak, cooldowns)
   - Decay and scarcity scaling
   - Risk tier adjustments

## 📁 New Configuration Files

### `config/session-shapes.json`
Defines 7 session shapes with their behaviors:
- **MicroCheck (MC)**: 10-60s, minimal engagement
- **CasualSkim (CS)**: 3-8 min, standard scroll
- **DeepRead (DR)**: 6-12 min, thoughtful engagement
- **SkimBounce (SB)**: 2-5 min, fast scrolling
- **CreatorResearch (CR)**: 4-9 min, profile exploration
- **SocialButterfly**: CS with more comments
- **Sleepy**: Late night variant with longer dwells

### `config/content-types.json`
Content detection rules and scarcity thresholds:
- Selectors for Followed/Suggested/Ad posts
- "Caught Up" detection
- Scarcity thresholds (Followed <40%, Suggested ≥50%)
- Following feed navigation

### `config/like-rates.json`
Mood-based like rates per content type:
- 8 mood types with Followed/Suggested rates
- Global gates (anti-streak, cooldowns, familiarity)
- Risk tier adjustments (New/Cold, Warming, Seasoned)
- Decay and scarcity scaling

### `config/daily-orchestrator.json`
Session orchestration parameters:
- Session gating (min gap, freshness gate, fatigue throttle)
- Daypart weights for shape selection
- No-op realism (10-20% micro-checks that exit)
- Cross-session memory settings
- Daily budgeting constraints

## 🚀 New Activity Type: `homefeed`

The Smart Runner now supports a new `homefeed` activity type that uses the orchestrator:

```javascript
// In smart-runner.js
if (plan.type === 'homefeed' && plan.params.useOrchestrator) {
  await this.startHomeFeedSession(profileId, plan, sessionId);
}
```

### Homefeed Session Flow

1. **Session Gating**: Check min gap, freshness gate, fatigue throttle
2. **Shape Selection**: Choose session shape based on daypart and history
3. **Parameter Calculation**: Calculate duration, like caps, actions
4. **Execution**: Run Home Feed Scroller with selected parameters
5. **Memory Update**: Store session results and update cross-session state

## 📊 Session Shapes

### Micro Check (MC)
- **Duration**: 10-60 seconds
- **Behavior**: Quick content scan, minimal engagement
- **Use Case**: Freshness checks, no-op realism

### Casual Skim (CS)
- **Duration**: 3-8 minutes
- **Behavior**: Standard home scroll with modest likes
- **Use Case**: Regular browsing sessions

### Deep Read (DR)
- **Duration**: 6-12 minutes
- **Behavior**: Slower drags, caption expansions, more comments
- **Use Case**: Thoughtful content consumption

### Skim & Bounce (SB)
- **Duration**: 2-5 minutes
- **Behavior**: Fast flicks, very few likes, early exits
- **Use Case**: Quick content sampling

### Creator Research (CR)
- **Duration**: 4-9 minutes
- **Behavior**: More profile hops, fewer likes, saves
- **Use Case**: Account exploration and research

## 🎭 Mood-Based Behavior

### Mood Types
- **DoNotDisturb**: Minimal engagement (3-6 likes/100 posts)
- **Sleepy**: Longer dwells, fewer likes (4-8 likes/100 posts)
- **Casual**: Baseline engagement (6-12 likes/100 posts)
- **DeepDive**: More caption reads (6-10 likes/100 posts)
- **SkimLike**: Faster sampling (10-18 likes/100 posts)
- **CreatorResearch**: Profile exploration (5-9 likes/100 posts)
- **SocialButterfly**: More comments (8-14 likes/100 posts)
- **WeekendFrenzy**: Higher energy (10-18 likes/100 posts)

### Content Type Split
- **Followed posts**: Higher engagement rates
- **Suggested posts**: Lower engagement rates (30-60% reduction)
- **Ads**: 0% like rate (always blocked)

## 🧠 Cross-Session Memory

### Stored Data
- **Last seen post IDs**: Ring buffer of ~60 posts
- **Like window**: Last 5 posts for anti-streak
- **Last session**: Shape, mood, duration, exit reason
- **Familiar accounts**: 72-hour cache of interacted accounts
- **Scarcity observations**: Last 3 sessions' content ratios

### Usage
- **Entry variation**: 30% chance for Notifications glance, 15% for Following peek
- **Shape avoidance**: Don't repeat same shape consecutively
- **Throttling**: Reduce sessions if scarcity trends upward

## 🛡️ Risk Tiers

### New/Cold (age <30d or recent block)
- **Like scalar**: 0.6x
- **Daily fence**: ≤60 likes/day

### Warming (1-6 mo, clean 7d)
- **Like scalar**: 0.85x
- **Daily fence**: ≤120 likes/day

### Seasoned (>6 mo, clean)
- **Like scalar**: 1.0x
- **Daily fence**: ≤200 likes/day

## 🔧 Global Gates

### Always Applied
- **Ad gate**: 0% like rate for sponsored content
- **Min dwell**: ≥1.2s exposure before like
- **Anti-streak**: ≤2 likes in last 5 posts
- **Post-like cooldown**: 80% chance next post can't be liked
- **First-lap caution**: Halved probability for first 2-3 posts
- **Familiarity bump**: 1.2x multiplier for known accounts
- **Caption-expanded bump**: +0.02 absolute for expanded captions

## 📱 Natural Exits

### Exit Conditions
- **"Caught Up"**: End session when Instagram shows this
- **Cap reached**: Hit daily or session like limits
- **Content stall**: Spinner >4s twice
- **Boredom**: After 2-3 Suggested posts in a row under scarcity

## 🧪 Testing Framework

### Test Suites
- **`test-orchestrator.js`**: Session gating, shape selection, parameters
- **`test-like-rates.js`**: Mood-based rates, global gates, decay
- **`test-integration.js`**: End-to-end flows, cross-session memory

### Running Tests
```bash
# Test orchestrator logic
node smart-runner/test-orchestrator.js

# Test like rate calculations
node smart-runner/test-like-rates.js

# Test integration flows
node smart-runner/test-integration.js
```

## 🚀 Usage

### Starting Smart Runner with Homefeed
```bash
# Start Smart Runner for a pod
node smart-runner/smart-runner.js --pod podA
```

### Manual Homefeed Session
```bash
# Run homefeed session directly
node humanize/runHomeFeed.js k12im9s2
```

### Configuration
Update `config/smart-runner.json` to include homefeed weights:
```json
{
  "weights": {
    "base": {
      "homefeed": 0.60,
      "follow": 0.35,
      "unfollow": 0.20,
      "reels": 0.80,
      "stories": 0.10
    }
  }
}
```

## 📈 Expected Behavior

### Multi-Session Realism
- Sessions vary by time of day and recent activity
- 10-20% of scheduled runs become micro-checks that exit
- Different session shapes prevent repetitive behavior
- Cross-session memory prevents duplicate actions

### Scarcity-Aware Behavior
- Accounts with few followings get shorter, lower-engagement sessions
- Suggested posts receive fewer likes than Followed posts
- Early exits on "Caught Up" or after multiple Suggested posts
- Optional pivot to Following feed for variety

### Human-like Patterns
- Varying entry points (Notifications glance, Following peek)
- Natural exit conditions (caps, boredom, content stall)
- Uneven liking patterns (more on Followed, less on Suggested)
- Never like ads (0% ad-like rate)

## 🔍 Monitoring

### Telemetry
Each post interaction is logged with:
- `post_idx`, `source`, `dwell_ms`, `intent`
- `like_attempted`, `like_success`, `likeP_before`, `likeP_after`
- `reason_blocked`, `mood`, `shape`, `scarcity`, `riskTier`

### Key Metrics
- Likes per 100 non-ad posts (split Followed vs Suggested)
- Ad-like rate (must be 0%)
- Streak monitor (≤2 likes in last 5 posts, 99%+ of time)
- Session variance (different shapes day-to-day)

## 🎉 Benefits

1. **Human-like Behavior**: Sessions vary naturally based on time, mood, and content
2. **Scarcity Awareness**: Adapts to accounts with few followings
3. **Cross-Session Memory**: Prevents repetitive patterns across sessions
4. **Risk Management**: Conservative daily budgets and risk tier adjustments
5. **Natural Exits**: Exits for human-like reasons (caught up, bored, etc.)
6. **Content Type Awareness**: Different engagement for Followed vs Suggested posts
7. **Comprehensive Logging**: Detailed telemetry for monitoring and optimization

## 🔧 Maintenance

### Configuration Updates
- Adjust session shape weights in `config/session-shapes.json`
- Modify like rates in `config/like-rates.json`
- Update orchestration parameters in `config/daily-orchestrator.json`

### Memory Management
- Session memory automatically cleans up old data (7-day retention)
- Familiar accounts cache expires after 72 hours
- Scarcity observations limited to last 3 sessions

### Monitoring
- Check `data/session_memory.json` for cross-session state
- Monitor `data/runner_events.json` for session logs
- Review telemetry for adherence to human-like patterns

This upgrade transforms Smart Runner v1 into a sophisticated, human-like Instagram automation system that adapts to content scarcity, maintains cross-session memory, and provides natural, varied behavior patterns.
