# Complete Project Structure Overview

## 🎯 **Project: Instagram Automation Bot**

This is a **Node.js backend project** that automates Instagram actions with human-like behavior using AdsPower browser profiles and Puppeteer.

---

## 📁 **Complete Folder Structure & Purpose**

### 🏠 **Root Level Files**
```
├── main.js                    # Main follow flow runner
├── unfollow.js               # Unfollow flow runner  
├── runner.js                 # Follow scheduler with cooldowns
├── unfollow-runner.js        # Unfollow scheduler with cooldowns
├── config.js                 # Project constants & configuration
├── package.json              # Node.js dependencies
├── mapping.json              # Maps AdsPower user_id → {username, file}
├── account_stats.json        # Account statistics tracking
└── README.md                 # Project documentation
```

### 🤖 **Actions Folder** (`actions/`)
**Purpose**: Core Instagram automation actions
```
├── followUser.js             # Follow a specific user
├── unfollowUsers.js          # Unfollow users from Following list
├── searchAndOpenProfile.js   # Search and navigate to profiles
└── unfollowViaSearchIfNotFound.js # Alternative unfollow method
```

### 🛠️ **Helpers Folder** (`helpers/`)
**Purpose**: Utility functions and core services
```
├── adsPower.js               # Connects Puppeteer to AdsPower profiles
├── instagramNavigation.js    # Instagram-specific navigation helpers
├── scroll.js                 # Scrolling utilities
├── files.js                  # File I/O operations
└── utils.js                  # General utility functions
```

### 🎭 **Humanize Folder** (`humanize/`)
**Purpose**: Human-like behavior simulation (THIS IS WHAT WE REFACTORED!)
```
├── moods.js                  # Main mood system entry point
├── moods/                    # Refactored mood system
│   ├── core/                 # Core mood logic
│   ├── configs/              # Individual mood configurations
│   └── utils/                # Mood utilities
├── constants/                # System constants
├── scripts/                  # Human-like interaction scripts
│   ├── watchReels.js         # Reels watching with mood integration
│   ├── watchStories.js       # Stories watching with mood integration
│   └── humanSwipe.js         # Human-like swipe engine
├── humanSwipe-Helpers/       # Advanced human simulation
└── run.js                    # Humanize demo runner
```

### 🎯 **Targets Folder** (`targets/`)
**Purpose**: User lists for follow/unfollow operations
```
├── targets(filtered)/        # Filtered user lists (grouped)
│   ├── group01.txt          # Username list for group 1
│   ├── group02.txt          # Username list for group 2
│   └── ...
└── targets(unfiltered)/     # Raw unfiltered user lists
```

### 📚 **Docs Folder** (`docs/`)
**Purpose**: Project documentation
```
└── plan.md                  # Development plans and tasks
```

### 🧪 **Test Files** (Root Level)
**Purpose**: Testing and development
```
├── test-humanSwipe.js       # Test human swipe functionality
├── test-typing-simple.js    # Test typing simulation
└── test-typing-simulator.js # Advanced typing tests
```

---

## 🔧 **What Each Major Component Does**

### 1. **Main Automation Engine**
- **`main.js`**: Follows users from target lists
- **`unfollow.js`**: Unfollows previously followed users
- **`runner.js`**: Automated scheduler for following
- **`unfollow-runner.js`**: Automated scheduler for unfollowing

### 2. **Core Actions** (`actions/`)
- **`followUser.js`**: Executes follow action on a user
- **`unfollowUsers.js`**: Executes unfollow actions
- **`searchAndOpenProfile.js`**: Navigates to user profiles
- **`unfollowViaSearchIfNotFound.js`**: Alternative unfollow method

### 3. **Support Services** (`helpers/`)
- **`adsPower.js`**: Manages browser profile connections
- **`instagramNavigation.js`**: Instagram-specific navigation
- **`scroll.js`**: Human-like scrolling behavior
- **`files.js`**: File operations for logs and data
- **`utils.js`**: General utility functions

### 4. **Human Simulation** (`humanize/`)
- **Mood System**: Time-based behavior modifiers (REFACTORED!)
- **Reels Engine**: Human-like reels watching
- **Stories Engine**: Human-like stories watching
- **Swipe Engine**: Realistic touch gestures
- **Typing Simulation**: Human-like typing patterns

### 5. **Data Management**
- **`mapping.json`**: Links AdsPower profiles to target files
- **`targets/`**: User lists for automation
- **`account_stats.json`**: Tracks account performance
- **`config.js`**: Project configuration

---

## 🎯 **How Everything Works Together**

### **Follow Flow:**
1. `main.js` reads `mapping.json` and target files
2. Uses `actions/followUser.js` to follow users
3. `humanize/moods.js` provides time-based behavior
4. `helpers/adsPower.js` manages browser sessions
5. Logs results to `logs/followed.json`

### **Unfollow Flow:**
1. `unfollow.js` opens profile's Following list
2. Uses `actions/unfollowUsers.js` to unfollow
3. Applies human-like delays and behavior
4. Logs results to `logs/unfollowed.json`

### **Human Simulation:**
1. `humanize/run.js` starts human-like sessions
2. `humanize/scripts/watchReels.js` controls reels
3. `humanize/moods.js` provides mood-based behavior
4. `humanize/humanSwipe-Helpers/` provides realistic gestures

---

## 🚀 **Key Features**

### ✅ **Current Capabilities:**
- Follow/unfollow automation with logging
- Human-like reels watching with swipes
- Time-based mood system (REFACTORED!)
- AdsPower profile management
- Scheduler with cooldowns
- Target list management

### 🔮 **Planned Features:**
- Comments interaction
- Profile exploration
- Enhanced reels reliability
- "Big-like" heuristics
- Advanced human simulation

---

## 💡 **Why This Architecture?**

### **Separation of Concerns:**
- **Actions**: Pure Instagram operations
- **Helpers**: Utility and support functions
- **Humanize**: Behavior simulation (REFACTORED!)
- **Targets**: Data management
- **Config**: Centralized configuration

### **Scalability:**
- Easy to add new actions
- Modular mood system
- Configurable target lists
- Extensible human simulation

### **Maintainability:**
- Clear folder structure
- Single responsibility principle
- Easy to test individual components
- Well-documented code

---

## 🎉 **Summary**

Your project is a **sophisticated Instagram automation system** with:

- **Core Automation**: Follow/unfollow with scheduling
- **Human Simulation**: Realistic behavior patterns
- **Mood System**: Time-based behavior modifiers (REFACTORED!)
- **Profile Management**: AdsPower integration
- **Data Management**: Target lists and logging

The `humanize` folder (which we refactored) is just **one component** - it provides the human-like behavior that makes the automation look natural and avoid detection! 🎭
