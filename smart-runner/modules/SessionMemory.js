const fs = require('fs').promises;
const path = require('path');

class SessionMemory {
  constructor(dataPath) {
    this.dataPath = dataPath;
    this.memoryFile = path.join(dataPath, 'session_memory.json');
    this.memory = null;
  }

  async initialize() {
    try {
      await this.loadMemory();
      console.log('🧠 Session Memory initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Session Memory:', error.message);
      throw error;
    }
  }

  /**
   * Load memory from file
   */
  async loadMemory() {
    try {
      const data = await fs.readFile(this.memoryFile, 'utf8');
      this.memory = JSON.parse(data);
    } catch (error) {
      // File doesn't exist, create new memory structure
      this.memory = {
        profiles: {},
        global: {
          lastUpdate: new Date().toISOString(),
          version: '1.0'
        }
      };
      await this.saveMemory();
    }
  }

  /**
   * Save memory to file
   */
  async saveMemory() {
    try {
      this.memory.global.lastUpdate = new Date().toISOString();
      await fs.writeFile(this.memoryFile, JSON.stringify(this.memory, null, 2), 'utf8');
    } catch (error) {
      console.error('❌ Failed to save session memory:', error.message);
    }
  }

  /**
   * Get or create profile memory
   */
  getProfileMemory(profileId) {
    if (!this.memory.profiles[profileId]) {
      this.memory.profiles[profileId] = {
        lastSeenIds: [],
        likeWindow: [],
        lastSession: null,
        familiarAccounts: [],
        scarcityObservations: [],
        entryVariations: [],
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };
    }
    return this.memory.profiles[profileId];
  }

  /**
   * Add post ID to last seen buffer
   */
  addLastSeenId(profileId, postId) {
    const profileMemory = this.getProfileMemory(profileId);
    const bufferSize = 60; // Ring buffer size
    
    profileMemory.lastSeenIds.push({
      postId,
      timestamp: new Date().toISOString()
    });
    
    // Maintain ring buffer size
    if (profileMemory.lastSeenIds.length > bufferSize) {
      profileMemory.lastSeenIds = profileMemory.lastSeenIds.slice(-bufferSize);
    }
    
    profileMemory.lastUpdated = new Date().toISOString();
  }

  /**
   * Get last seen post IDs
   */
  getLastSeenIds(profileId) {
    const profileMemory = this.getProfileMemory(profileId);
    return profileMemory.lastSeenIds.map(item => item.postId);
  }

  /**
   * Add like to window
   */
  addLikeToWindow(profileId, postId, contentType, timestamp) {
    const profileMemory = this.getProfileMemory(profileId);
    const windowSize = 5;
    
    profileMemory.likeWindow.push({
      postId,
      contentType,
      timestamp: timestamp || new Date().toISOString()
    });
    
    // Maintain window size
    if (profileMemory.likeWindow.length > windowSize) {
      profileMemory.likeWindow = profileMemory.likeWindow.slice(-windowSize);
    }
    
    profileMemory.lastUpdated = new Date().toISOString();
  }

  /**
   * Get like window (last 5 posts)
   */
  getLikeWindow(profileId) {
    const profileMemory = this.getProfileMemory(profileId);
    return profileMemory.likeWindow;
  }

  /**
   * Check if post was recently liked
   */
  wasRecentlyLiked(profileId, postId) {
    const likeWindow = this.getLikeWindow(profileId);
    return likeWindow.some(like => like.postId === postId);
  }

  /**
   * Get like count in window
   */
  getLikeCountInWindow(profileId) {
    const likeWindow = this.getLikeWindow(profileId);
    return likeWindow.length;
  }

  /**
   * Update last session
   */
  updateLastSession(profileId, sessionData) {
    const profileMemory = this.getProfileMemory(profileId);
    profileMemory.lastSession = {
      shape: sessionData.shape,
      mood: sessionData.mood,
      startTs: sessionData.startTs,
      endTs: sessionData.endTs,
      likes: sessionData.likes,
      reasonEnded: sessionData.reasonEnded,
      duration: sessionData.duration,
      scarcity: sessionData.scarcity,
      riskTier: sessionData.riskTier
    };
    profileMemory.lastUpdated = new Date().toISOString();
  }

  /**
   * Get last session
   */
  getLastSession(profileId) {
    const profileMemory = this.getProfileMemory(profileId);
    return profileMemory.lastSession;
  }

  /**
   * Add familiar account
   */
  addFamiliarAccount(profileId, username, interactionType) {
    const profileMemory = this.getProfileMemory(profileId);
    const hours = 72; // 72-hour cache
    
    // Remove old entries
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    profileMemory.familiarAccounts = profileMemory.familiarAccounts.filter(
      account => new Date(account.timestamp) > cutoffTime
    );
    
    // Add new entry
    profileMemory.familiarAccounts.push({
      username,
      interactionType,
      timestamp: new Date().toISOString()
    });
    
    profileMemory.lastUpdated = new Date().toISOString();
  }

  /**
   * Check if account is familiar
   */
  isFamiliarAccount(profileId, username) {
    const profileMemory = this.getProfileMemory(profileId);
    const hours = 72;
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return profileMemory.familiarAccounts.some(account => 
      account.username === username && new Date(account.timestamp) > cutoffTime
    );
  }

  /**
   * Get familiar accounts
   */
  getFamiliarAccounts(profileId) {
    const profileMemory = this.getProfileMemory(profileId);
    const hours = 72;
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return profileMemory.familiarAccounts
      .filter(account => new Date(account.timestamp) > cutoffTime)
      .map(account => account.username);
  }

  /**
   * Add scarcity observation
   */
  addScarcityObservation(profileId, observation) {
    const profileMemory = this.getProfileMemory(profileId);
    const maxObservations = 3;
    
    profileMemory.scarcityObservations.push({
      ...observation,
      timestamp: new Date().toISOString()
    });
    
    // Maintain observation history
    if (profileMemory.scarcityObservations.length > maxObservations) {
      profileMemory.scarcityObservations = profileMemory.scarcityObservations.slice(-maxObservations);
    }
    
    profileMemory.lastUpdated = new Date().toISOString();
  }

  /**
   * Get scarcity observations
   */
  getScarcityObservations(profileId) {
    const profileMemory = this.getProfileMemory(profileId);
    return profileMemory.scarcityObservations;
  }

  /**
   * Add entry variation
   */
  addEntryVariation(profileId, variation) {
    const profileMemory = this.getProfileMemory(profileId);
    const maxVariations = 10;
    
    profileMemory.entryVariations.push({
      variation,
      timestamp: new Date().toISOString()
    });
    
    // Maintain variation history
    if (profileMemory.entryVariations.length > maxVariations) {
      profileMemory.entryVariations = profileMemory.entryVariations.slice(-maxVariations);
    }
    
    profileMemory.lastUpdated = new Date().toISOString();
  }

  /**
   * Get recent entry variations
   */
  getRecentEntryVariations(profileId) {
    const profileMemory = this.getProfileMemory(profileId);
    return profileMemory.entryVariations.slice(-5); // Last 5 variations
  }

  /**
   * Check if should vary entry point
   */
  shouldVaryEntry(profileId) {
    const lastSession = this.getLastSession(profileId);
    const recentVariations = this.getRecentEntryVariations(profileId);
    
    // If last session started on Home, vary entry
    if (lastSession && lastSession.entryPoint === 'home') {
      return Math.random() < 0.3; // 30% chance
    }
    
    // If no recent variations, encourage variation
    if (recentVariations.length === 0) {
      return Math.random() < 0.4; // 40% chance
    }
    
    return Math.random() < 0.15; // 15% chance
  }

  /**
   * Get entry variation suggestion
   */
  getEntryVariation(profileId) {
    const shouldVary = this.shouldVaryEntry(profileId);
    
    if (!shouldVary) {
      return { type: 'directHome', probability: 0.55 };
    }
    
    const random = Math.random();
    if (random < 0.3) {
      return { type: 'notificationsGlance', probability: 0.3 };
    } else if (random < 0.45) {
      return { type: 'followingPeek', probability: 0.15 };
    } else {
      return { type: 'directHome', probability: 0.55 };
    }
  }

  /**
   * Update daily counters
   */
  updateDailyCounters(profileId, counters) {
    const profileMemory = this.getProfileMemory(profileId);
    const today = new Date().toDateString();
    
    if (!profileMemory.dailyCounters) {
      profileMemory.dailyCounters = {};
    }
    
    if (!profileMemory.dailyCounters[today]) {
      profileMemory.dailyCounters[today] = {
        sessions: 0,
        likes: 0,
        comments: 0,
        profileHops: 0,
        saves: 0
      };
    }
    
    // Update counters
    Object.keys(counters).forEach(key => {
      if (profileMemory.dailyCounters[today][key] !== undefined) {
        profileMemory.dailyCounters[today][key] += counters[key];
      }
    });
    
    profileMemory.lastUpdated = new Date().toISOString();
  }

  /**
   * Get daily counters
   */
  getDailyCounters(profileId) {
    const profileMemory = this.getProfileMemory(profileId);
    const today = new Date().toDateString();
    
    return profileMemory.dailyCounters?.[today] || {
      sessions: 0,
      likes: 0,
      comments: 0,
      profileHops: 0,
      saves: 0
    };
  }

  /**
   * Clean up old data
   */
  async cleanupOldData() {
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    
    Object.keys(this.memory.profiles).forEach(profileId => {
      const profileMemory = this.memory.profiles[profileId];
      
      // Clean up old daily counters
      if (profileMemory.dailyCounters) {
        Object.keys(profileMemory.dailyCounters).forEach(date => {
          if (new Date(date) < cutoffDate) {
            delete profileMemory.dailyCounters[date];
          }
        });
      }
      
      // Clean up old entry variations
      if (profileMemory.entryVariations) {
        profileMemory.entryVariations = profileMemory.entryVariations.filter(
          variation => new Date(variation.timestamp) > cutoffDate
        );
      }
    });
    
    await this.saveMemory();
  }

  /**
   * Get memory statistics
   */
  getMemoryStats() {
    const profiles = Object.keys(this.memory.profiles);
    const totalProfiles = profiles.length;
    
    let totalLastSeenIds = 0;
    let totalFamiliarAccounts = 0;
    let totalScarcityObservations = 0;
    
    profiles.forEach(profileId => {
      const profileMemory = this.memory.profiles[profileId];
      totalLastSeenIds += profileMemory.lastSeenIds?.length || 0;
      totalFamiliarAccounts += profileMemory.familiarAccounts?.length || 0;
      totalScarcityObservations += profileMemory.scarcityObservations?.length || 0;
    });
    
    return {
      totalProfiles,
      totalLastSeenIds,
      totalFamiliarAccounts,
      totalScarcityObservations,
      lastUpdate: this.memory.global.lastUpdate
    };
  }
}

module.exports = SessionMemory;
