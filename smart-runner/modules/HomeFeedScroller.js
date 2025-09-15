const ContentTypeDetector = require('./ContentTypeDetector');
const LikeRateCalculator = require('./LikeRateCalculator');
const SessionMemory = require('./SessionMemory');

class HomeFeedScroller {
  constructor(configPath, dataPath) {
    this.configPath = configPath;
    this.dataPath = dataPath;
    this.contentDetector = null;
    this.likeCalculator = null;
    this.sessionMemory = null;
    this.config = null;
  }

  async initialize() {
    try {
      // Initialize components
      this.contentDetector = new ContentTypeDetector(this.configPath);
      this.likeCalculator = new LikeRateCalculator(this.configPath);
      this.sessionMemory = new SessionMemory(this.dataPath);
      
      await Promise.all([
        this.contentDetector.initialize(),
        this.likeCalculator.initialize(),
        this.sessionMemory.initialize()
      ]);
      
      console.log('📱 Home Feed Scroller initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Home Feed Scroller:', error.message);
      throw error;
    }
  }

  /**
   * Execute home feed session
   */
  async executeSession(page, profileId, sessionParams, state) {
    const sessionStart = Date.now();
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🚀 Starting ${sessionParams.shape} session for ${profileId}`);
    console.log(`📊 Session params:`, sessionParams);
    
    try {
      // Initialize session state
      const sessionState = {
        profileId,
        sessionId,
        shape: sessionParams.shape,
        mood: sessionParams.mood,
        startTime: sessionStart,
        postsSeen: 0,
        likesAttempted: 0,
        likesSuccessful: 0,
        commentsOpened: 0,
        profileHops: 0,
        saves: 0,
        exitReason: null,
        scarcity: false,
        riskTier: sessionParams.riskTier
      };
      
      // Perform entry variation
      await this.performEntryVariation(page, profileId, state);
      
      // Analyze feed content
      const feedAnalysis = await this.contentDetector.analyzeFeed(page, this.sessionMemory);
      sessionState.scarcity = feedAnalysis.scarcity;
      
      // Add scarcity observation to memory
      this.sessionMemory.addScarcityObservation(profileId, {
        followedRatio: feedAnalysis.analysis.followedRatio,
        suggestedRatio: feedAnalysis.analysis.suggestedRatio,
        adRatio: feedAnalysis.analysis.adRatio,
        totalPosts: feedAnalysis.analysis.totalPosts
      });
      
      // Check for early exit conditions
      if (feedAnalysis.caughtUp) {
        console.log('✅ "Caught Up" detected, ending session early');
        return await this.endSession(sessionState, 'caughtUp', sessionStart);
      }
      
      // Execute session shape
      const sessionResult = await this.executeSessionShape(
        page, 
        sessionState, 
        sessionParams, 
        state, 
        feedAnalysis
      );
      
      return sessionResult;
      
    } catch (error) {
      console.error('❌ Session execution failed:', error.message);
      return await this.endSession({
        profileId,
        sessionId,
        shape: sessionParams.shape,
        mood: sessionParams.mood,
        startTime: sessionStart,
        error: error.message
      }, 'error', sessionStart);
    }
  }

  /**
   * Perform entry variation
   */
  async performEntryVariation(page, profileId, state) {
    const entryVariation = this.sessionMemory.getEntryVariation(profileId);
    
    console.log(`🎯 Entry variation: ${entryVariation.type}`);
    
    switch (entryVariation.type) {
      case 'notificationsGlance':
        await this.performNotificationsGlance(page);
        break;
      case 'followingPeek':
        await this.performFollowingPeek(page);
        break;
      case 'directHome':
      default:
        // Navigate directly to home feed
        await this.navigateToHome(page);
        break;
    }
    
    // Record entry variation
    this.sessionMemory.addEntryVariation(profileId, entryVariation.type);
  }

  /**
   * Perform notifications glance
   */
  async performNotificationsGlance(page) {
    try {
      console.log('🔔 Performing notifications glance...');
      
      // Click on notifications icon with timeout
      const notificationsIcon = await page.$('[aria-label="Notifications"]').catch(() => null);
      if (notificationsIcon) {
        await Promise.race([
          notificationsIcon.click(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Click timeout')), 5000))
        ]);
        
        await new Promise(resolve => setTimeout(resolve, this.randomBetween(1000, 3000)));
        
        // Go back to home with timeout
        await Promise.race([
          page.goBack(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Go back timeout')), 5000))
        ]);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.log('⚠️  Notifications icon not found, skipping glance');
      }
    } catch (error) {
      console.log('⚠️  Notifications glance failed:', error.message);
      // Try to go back to home page if we're stuck
      try {
        await page.goto('https://www.instagram.com/', { timeout: 10000 });
      } catch (navError) {
        console.log('⚠️  Failed to navigate back to home:', navError.message);
      }
    }
  }

  /**
   * Perform following peek
   */
  async performFollowingPeek(page) {
    try {
      console.log('👥 Performing following peek...');
      
      // Check if following feed is available
      const followingAvailable = await this.contentDetector.checkFollowingFeedAvailable(page);
      if (followingAvailable) {
        await this.contentDetector.navigateToFollowingFeed(page);
        await new Promise(resolve => setTimeout(resolve, this.randomBetween(45000, 90000)));
        
        // Go back to home
        await page.goBack();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.log('⚠️  Following peek failed:', error.message);
    }
  }

  /**
   * Navigate to home feed
   */
  async navigateToHome(page) {
    try {
      // Click on home icon
      const homeIcon = await page.$('[aria-label="Home"]').catch(() => null);
      if (homeIcon) {
        await homeIcon.click();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.log('⚠️  Home navigation failed:', error.message);
    }
  }

  /**
   * Execute specific session shape
   */
  async executeSessionShape(page, sessionState, sessionParams, state, feedAnalysis) {
    const shape = sessionParams.shape;
    const startTime = Date.now();
    
    console.log(`🎭 Executing ${shape} session shape...`);
    
    switch (shape) {
      case 'MicroCheck':
        return await this.executeMicroCheck(page, sessionState, sessionParams, state, feedAnalysis);
      case 'CasualSkim':
        return await this.executeCasualSkim(page, sessionState, sessionParams, state, feedAnalysis);
      case 'DeepRead':
        return await this.executeDeepRead(page, sessionState, sessionParams, state, feedAnalysis);
      case 'SkimBounce':
        return await this.executeSkimBounce(page, sessionState, sessionParams, state, feedAnalysis);
      case 'CreatorResearch':
        return await this.executeCreatorResearch(page, sessionState, sessionParams, state, feedAnalysis);
      case 'SocialButterfly':
        return await this.executeSocialButterfly(page, sessionState, sessionParams, state, feedAnalysis);
      case 'Sleepy':
        return await this.executeSleepy(page, sessionState, sessionParams, state, feedAnalysis);
      default:
        throw new Error(`Unknown session shape: ${shape}`);
    }
  }

  /**
   * Execute Micro Check session
   */
  async executeMicroCheck(page, sessionState, sessionParams, state, feedAnalysis) {
    console.log('🔍 Executing Micro Check...');
    
    // Scan 2-4 posts with minimal engagement
    const postsToScan = this.randomBetween(2, 4);
    let consecutiveNoPosts = 0;
    const maxConsecutiveNoPosts = 2;
    
    // Initial wait for posts to load
    await this.waitForPostsToLoad(page);
    
    for (let i = 0; i < postsToScan; i++) {
      const postMetadata = await this.scanPost(page, sessionState);
      
      if (!postMetadata) {
        consecutiveNoPosts++;
        console.log(`⚠️  No post found (${consecutiveNoPosts}/${maxConsecutiveNoPosts})`);
        
        if (consecutiveNoPosts >= maxConsecutiveNoPosts) {
          console.log('🏁 No posts found after multiple attempts, ending micro check');
          break;
        }
        
        // Try scrolling to load more posts
        await this.scrollToNextPost(page);
        await new Promise(resolve => setTimeout(resolve, 1500));
        continue;
      }
      
      // Reset consecutive no posts counter
      consecutiveNoPosts = 0;
      sessionState.postsSeen++;
      
      console.log(`📱 Micro check post ${sessionState.postsSeen}: ${postMetadata.username}`);
      
      // Very low engagement for micro check
      if (Math.random() < 0.1 && postMetadata.contentType === 'followed') {
        await this.performLike(page, postMetadata, sessionState, state);
      }
      
      // Scroll to next post
      await this.scrollToNextPost(page);
      await new Promise(resolve => setTimeout(resolve, this.randomBetween(500, 1500)));
    }
    
    return await this.endSession(sessionState, 'microCheckComplete', sessionState.startTime);
  }

  /**
   * Execute Casual Skim session
   */
  async executeCasualSkim(page, sessionState, sessionParams, state, feedAnalysis) {
    console.log('📖 Executing Casual Skim...');
    
    const maxDuration = sessionParams.duration;
    const startTime = Date.now();
    let consecutiveNoPosts = 0;
    const maxConsecutiveNoPosts = 3;
    
    // Initial wait for posts to load
    await this.waitForPostsToLoad(page);
    
    while (Date.now() - startTime < maxDuration) {
      const postMetadata = await this.scanPost(page, sessionState);
      
      if (!postMetadata) {
        consecutiveNoPosts++;
        console.log(`⚠️  No post found (${consecutiveNoPosts}/${maxConsecutiveNoPosts})`);
        
        if (consecutiveNoPosts >= maxConsecutiveNoPosts) {
          console.log('🏁 No posts found after multiple attempts, ending session');
          break;
        }
        
        // Try scrolling to load more posts
        await this.scrollToNextPost(page);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      
      // Reset consecutive no posts counter
      consecutiveNoPosts = 0;
      sessionState.postsSeen++;
      
      console.log(`📱 Processing post ${sessionState.postsSeen}: ${postMetadata.username}`);
      
      // Calculate dwell time
      const dwellTime = this.likeCalculator.calculateDwellTime(postMetadata, 'CasualSkim', state);
      console.log(`⏱️  Dwell time: ${dwellTime}ms`);
      
      // Wait for dwell time
      await new Promise(resolve => setTimeout(resolve, dwellTime));
      
      // Perform actions based on session parameters
      await this.performPostActions(page, postMetadata, sessionState, state, sessionParams);
      
      // Check exit conditions
      const shouldExit = await this.checkExitConditions(page, sessionState, feedAnalysis);
      if (shouldExit) {
        console.log(`🏁 Exit condition met: ${sessionState.exitReason}`);
        break;
      }
      
      // Check time limit
      const elapsed = Date.now() - startTime;
      const remaining = maxDuration - elapsed;
      console.log(`⏰ Time remaining: ${Math.round(remaining/1000)}s`);
      
      if (remaining <= 0) {
        console.log('🏁 Time limit reached');
        break;
      }
      
      // Scroll to next post
      console.log('📜 Scrolling to next post...');
      await this.scrollToNextPost(page);
      await new Promise(resolve => setTimeout(resolve, this.randomBetween(500, 1200)));
    }
    
    return await this.endSession(sessionState, 'timeLimit', sessionState.startTime);
  }

  /**
   * Execute Deep Read session
   */
  async executeDeepRead(page, sessionState, sessionParams, state, feedAnalysis) {
    console.log('📚 Executing Deep Read...');
    
    const maxDuration = sessionParams.duration;
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxDuration) {
      const postMetadata = await this.scanPost(page, sessionState);
      if (!postMetadata) break;
      
      sessionState.postsSeen++;
      
      // Longer dwell time for deep read
      const dwellTime = this.likeCalculator.calculateDwellTime(postMetadata, 'DeepRead', state);
      
      // Wait for dwell time
      await new Promise(resolve => setTimeout(resolve, dwellTime));
      
      // More thoughtful engagement
      await this.performDeepReadActions(page, postMetadata, sessionState, state, sessionParams);
      
      // Check exit conditions
      if (await this.checkExitConditions(page, sessionState, feedAnalysis)) {
        break;
      }
      
      // Scroll to next post
      await this.scrollToNextPost(page);
      await new Promise(resolve => setTimeout(resolve, this.randomBetween(500, 1200)));
    }
    
    return await this.endSession(sessionState, 'timeLimit', sessionState.startTime);
  }

  /**
   * Execute Skim Bounce session
   */
  async executeSkimBounce(page, sessionState, sessionParams, state, feedAnalysis) {
    console.log('⚡ Executing Skim Bounce...');
    
    const maxDuration = sessionParams.duration;
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxDuration) {
      const postMetadata = await this.scanPost(page, sessionState);
      if (!postMetadata) break;
      
      sessionState.postsSeen++;
      
      // Short dwell time for skim bounce
      const dwellTime = this.likeCalculator.calculateDwellTime(postMetadata, 'SkimBounce', state);
      
      // Wait for dwell time
      await new Promise(resolve => setTimeout(resolve, dwellTime));
      
      // Minimal engagement
      if (Math.random() < 0.3) {
        await this.performLike(page, postMetadata, sessionState, state);
      }
      
      // Check exit conditions (more likely to exit early)
      if (await this.checkExitConditions(page, sessionState, feedAnalysis)) {
        break;
      }
      
      // Fast scroll
      await this.scrollToNextPost(page);
      await new Promise(resolve => setTimeout(resolve, this.randomBetween(200, 500)));
    }
    
    return await this.endSession(sessionState, 'skimBounceComplete', sessionState.startTime);
  }

  /**
   * Execute Creator Research session
   */
  async executeCreatorResearch(page, sessionState, sessionParams, state, feedAnalysis) {
    console.log('🔬 Executing Creator Research...');
    
    const maxDuration = sessionParams.duration;
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxDuration) {
      const postMetadata = await this.scanPost(page, sessionState);
      if (!postMetadata) break;
      
      sessionState.postsSeen++;
      
      // Moderate dwell time
      const dwellTime = this.likeCalculator.calculateDwellTime(postMetadata, 'CreatorResearch', state);
      
      // Wait for dwell time
      await new Promise(resolve => setTimeout(resolve, dwellTime));
      
      // More profile hops, fewer likes
      if (Math.random() < 0.4) {
        await this.performProfileHop(page, postMetadata, sessionState, state);
      } else if (Math.random() < 0.2) {
        await this.performLike(page, postMetadata, sessionState, state);
      }
      
      // Check exit conditions
      if (await this.checkExitConditions(page, sessionState, feedAnalysis)) {
        break;
      }
      
      // Scroll to next post
      await this.scrollToNextPost(page);
      await new Promise(resolve => setTimeout(resolve, this.randomBetween(400, 900)));
    }
    
    return await this.endSession(sessionState, 'researchComplete', sessionState.startTime);
  }

  /**
   * Execute Social Butterfly session
   */
  async executeSocialButterfly(page, sessionState, sessionParams, state, feedAnalysis) {
    console.log('🦋 Executing Social Butterfly...');
    
    const maxDuration = sessionParams.duration;
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxDuration) {
      const postMetadata = await this.scanPost(page, sessionState);
      if (!postMetadata) break;
      
      sessionState.postsSeen++;
      
      // Moderate dwell time
      const dwellTime = this.likeCalculator.calculateDwellTime(postMetadata, 'SocialButterfly', state);
      
      // Wait for dwell time
      await new Promise(resolve => setTimeout(resolve, dwellTime));
      
      // More comment engagement
      if (Math.random() < 0.6) {
        await this.performLike(page, postMetadata, sessionState, state);
      }
      
      if (Math.random() < 0.3) {
        await this.performCommentOpen(page, postMetadata, sessionState, state);
      }
      
      // Check exit conditions
      if (await this.checkExitConditions(page, sessionState, feedAnalysis)) {
        break;
      }
      
      // Scroll to next post
      await this.scrollToNextPost(page);
      await new Promise(resolve => setTimeout(resolve, this.randomBetween(400, 800)));
    }
    
    return await this.endSession(sessionState, 'timeLimit', sessionState.startTime);
  }

  /**
   * Execute Sleepy session
   */
  async executeSleepy(page, sessionState, sessionParams, state, feedAnalysis) {
    console.log('😴 Executing Sleepy session...');
    
    const maxDuration = sessionParams.duration;
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxDuration) {
      const postMetadata = await this.scanPost(page, sessionState);
      if (!postMetadata) break;
      
      sessionState.postsSeen++;
      
      // Longer dwells, fewer likes
      const dwellTime = this.likeCalculator.calculateDwellTime(postMetadata, 'Sleepy', state);
      
      // Wait for dwell time
      await new Promise(resolve => setTimeout(resolve, dwellTime));
      
      // Minimal engagement
      if (Math.random() < 0.2) {
        await this.performLike(page, postMetadata, sessionState, state);
      }
      
      // Check exit conditions
      if (await this.checkExitConditions(page, sessionState, feedAnalysis)) {
        break;
      }
      
      // Scroll to next post
      await this.scrollToNextPost(page);
      await new Promise(resolve => setTimeout(resolve, this.randomBetween(600, 1200)));
    }
    
    return await this.endSession(sessionState, 'sleepyComplete', sessionState.startTime);
  }

  /**
   * Scan individual post
   */
  async scanPost(page, sessionState) {
    try {
      // Get post metadata
      const postMetadata = await this.getPostMetadata(page);
      if (!postMetadata) return null;
      
      // Add to last seen IDs
      this.sessionMemory.addLastSeenId(sessionState.profileId, postMetadata.postId);
      
      return postMetadata;
    } catch (error) {
      console.log('⚠️  Post scan failed:', error.message);
      return null;
    }
  }

  /**
   * Get post metadata from current visible post
   */
  async getPostMetadata(page) {
    try {
      // Wait for posts to load
      await this.waitForPostsToLoad(page);
      
      // Try multiple selectors to find the current post
      const postSelectors = [
        'article[role="presentation"]',
        'article',
        'div[role="presentation"]',
        '[data-testid="post"]',
        'div[style*="position: relative"]'
      ];
      
      let postElement = null;
      for (const selector of postSelectors) {
        const posts = await page.$$(selector);
        if (posts.length > 0) {
          postElement = posts[0]; // Get the first visible post
          break;
        }
      }
      
      if (!postElement) {
        console.log('⚠️  No post element found, trying to scroll and reload...');
        // Try scrolling to load more posts
        await this.scrollToNextPost(page);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Try again after scroll
        for (const selector of postSelectors) {
          const posts = await page.$$(selector);
          if (posts.length > 0) {
            postElement = posts[0];
            console.log(`📱 Found post after scroll using selector: ${selector}`);
            break;
          }
        }
        
        if (!postElement) {
          console.log('⚠️  Still no post element found after scroll');
          return null;
        }
      }
      
      // Extract post metadata
      const metadata = await page.evaluate((element) => {
        try {
          // Get username
          const usernameElement = element.querySelector('a[href*="/"]') || 
                                 element.querySelector('[data-testid="user-name"]') ||
                                 element.querySelector('span[dir="auto"]');
          const username = usernameElement ? usernameElement.textContent?.trim() : 'unknown_user';
          
          // Get post ID from URL or generate one
          const linkElement = element.querySelector('a[href*="/p/"]');
          const postId = linkElement ? 
            linkElement.href.split('/p/')[1]?.split('/')[0] : 
            `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          // Check if it's a video
          const videoElement = element.querySelector('video');
          const isVideo = !!videoElement;
          
          // Check if it's an ad (look for "Sponsored" text)
          const adText = element.textContent?.includes('Sponsored') || 
                        element.textContent?.includes('Ad') ||
                        element.querySelector('[data-testid="ad-label"]');
          const isAd = !!adText;
          
          // Determine content type (simplified logic)
          const contentType = isAd ? 'ads' : 
                             element.textContent?.includes('Suggested for you') ? 'suggested' : 'followed';
          
          return {
            postId,
            username,
            contentType,
            isAd,
            isVideo,
            videoDuration: isVideo ? (Math.random() * 30 + 5) : 0,
            captionExpanded: false,
            dwellTime: 0,
            timestamp: new Date().toISOString(),
            elementFound: true
          };
        } catch (error) {
          return null;
        }
      }, postElement);
      
      if (!metadata) {
        console.log('⚠️  Failed to extract post metadata');
        return null;
      }
      
      console.log(`📱 Found post: ${metadata.username} (${metadata.contentType})`);
      return metadata;
      
    } catch (error) {
      console.log('⚠️  Post metadata extraction failed:', error.message);
      return null;
    }
  }

  /**
   * Perform post actions based on session parameters
   */
  async performPostActions(page, postMetadata, sessionState, state, sessionParams) {
    // Like action
    if (Math.random() < 0.4) {
      await this.performLike(page, postMetadata, sessionState, state);
    }
    
    // Comment open
    if (Math.random() < 0.1) {
      await this.performCommentOpen(page, postMetadata, sessionState, state);
    }
    
    // Profile hop
    if (Math.random() < 0.05) {
      await this.performProfileHop(page, postMetadata, sessionState, state);
    }
  }

  /**
   * Perform deep read actions
   */
  async performDeepReadActions(page, postMetadata, sessionState, state, sessionParams) {
    // More thoughtful engagement
    if (Math.random() < 0.5) {
      await this.performLike(page, postMetadata, sessionState, state);
    }
    
    // More comment opens
    if (Math.random() < 0.2) {
      await this.performCommentOpen(page, postMetadata, sessionState, state);
    }
    
    // Caption expansion
    if (Math.random() < 0.3) {
      await this.performCaptionExpansion(page, postMetadata, sessionState, state);
    }
  }

  /**
   * Perform like action
   */
  async performLike(page, postMetadata, sessionState, state) {
    try {
      // Calculate like rate
      const likeRate = this.likeCalculator.calculateLikeRate(
        sessionState.mood,
        postMetadata.contentType,
        sessionState.shape,
        state,
        this.sessionMemory,
        postMetadata
      );
      
      // Check if should attempt like
      const shouldLike = this.likeCalculator.shouldAttemptLike(likeRate.rate, postMetadata);
      
      if (shouldLike.shouldLike) {
        sessionState.likesAttempted++;
        
        // Perform like (simulated)
        const likeMethod = this.likeCalculator.getLikeMethod();
        console.log(`❤️  Liking post via ${likeMethod}`);
        
        // Simulate like success
        if (Math.random() < 0.95) { // 95% success rate
          sessionState.likesSuccessful++;
          
          // Add to like window
          this.sessionMemory.addLikeToWindow(
            sessionState.profileId,
            postMetadata.postId,
            postMetadata.contentType
          );
          
          // Add familiar account if liked
          this.sessionMemory.addFamiliarAccount(
            sessionState.profileId,
            postMetadata.username,
            'like'
          );
        }
      }
    } catch (error) {
      console.log('⚠️  Like action failed:', error.message);
    }
  }

  /**
   * Perform comment open action
   */
  async performCommentOpen(page, postMetadata, sessionState, state) {
    try {
      sessionState.commentsOpened++;
      console.log(`💬 Opening comments for post by ${postMetadata.username}`);
      
      // Simulate comment interaction
      await new Promise(resolve => setTimeout(resolve, this.randomBetween(1000, 3000)));
      
      // Add familiar account
      this.sessionMemory.addFamiliarAccount(
        sessionState.profileId,
        postMetadata.username,
        'comment'
      );
    } catch (error) {
      console.log('⚠️  Comment open failed:', error.message);
    }
  }

  /**
   * Perform profile hop action
   */
  async performProfileHop(page, postMetadata, sessionState, state) {
    try {
      sessionState.profileHops++;
      console.log(`👤 Hopping to profile: ${postMetadata.username}`);
      
      // Simulate profile visit
      await new Promise(resolve => setTimeout(resolve, this.randomBetween(2000, 5000)));
      
      // Go back to feed
      await page.goBack();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Add familiar account
      this.sessionMemory.addFamiliarAccount(
        sessionState.profileId,
        postMetadata.username,
        'profile'
      );
    } catch (error) {
      console.log('⚠️  Profile hop failed:', error.message);
    }
  }

  /**
   * Perform caption expansion action
   */
  async performCaptionExpansion(page, postMetadata, sessionState, state) {
    try {
      console.log(`📝 Expanding caption for post by ${postMetadata.username}`);
      
      // Simulate caption expansion
      await new Promise(resolve => setTimeout(resolve, this.randomBetween(600, 3500)));
      
      postMetadata.captionExpanded = true;
    } catch (error) {
      console.log('⚠️  Caption expansion failed:', error.message);
    }
  }

  /**
   * Check exit conditions
   */
  async checkExitConditions(page, sessionState, feedAnalysis) {
    console.log(`🔍 Checking exit conditions: postsSeen=${sessionState.postsSeen}, scarcity=${sessionState.scarcity}`);
    
    // Check for "Caught Up"
    const caughtUp = await this.contentDetector.detectCaughtUp(page);
    if (caughtUp) {
      console.log('🏁 Exit condition: caughtUp');
      sessionState.exitReason = 'caughtUp';
      return true;
    }
    
    // Check for content stall (temporarily disabled for debugging)
    const contentStall = await this.contentDetector.detectContentStall(page);
    if (contentStall) {
      console.log('⚠️  Content stall detected but ignoring for debugging');
      // sessionState.exitReason = 'contentStall';
      // return true;
    }
    
    // Check for boredom exit (scarcity mode)
    if (sessionState.scarcity && sessionState.postsSeen > 10) {
      const recentPosts = sessionState.postsSeen % 5;
      if (recentPosts >= 3) { // 3+ recent posts
        console.log('🏁 Exit condition: boredom');
        sessionState.exitReason = 'boredom';
        return true;
      }
    }
    
    console.log('✅ No exit conditions met, continuing session');
    return false;
  }

  /**
   * Wait for posts to load on the page
   */
  async waitForPostsToLoad(page) {
    try {
      // Wait for initial load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if posts are already loaded
      const initialPosts = await page.$$('article[role="presentation"], article, div[role="presentation"]');
      if (initialPosts.length > 0) {
        console.log(`📱 Found ${initialPosts.length} posts already loaded`);
        return;
      }
      
      // If no posts found, try scrolling to trigger loading
      console.log('📱 No posts found, scrolling to trigger loading...');
      await this.scrollToNextPost(page);
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check again after scroll
      const postsAfterScroll = await page.$$('article[role="presentation"], article, div[role="presentation"]');
      console.log(`📱 Found ${postsAfterScroll.length} posts after scroll`);
      
    } catch (error) {
      console.log('⚠️  Wait for posts failed:', error.message);
    }
  }

  /**
   * Scroll to next post with better Instagram-specific logic
   */
  async scrollToNextPost(page) {
    try {
      const viewport = await page.viewport();
      const scrollDistance = viewport.height * 0.6; // Smaller scroll for better post detection
      
      // Get current scroll position
      const currentScroll = await page.evaluate(() => window.pageYOffset);
      
      // Scroll down
      await page.evaluate((distance) => {
        window.scrollBy({
          top: distance,
          behavior: 'smooth'
        });
      }, scrollDistance);
      
      // Wait for scroll to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if we actually scrolled
      const newScroll = await page.evaluate(() => window.pageYOffset);
      const scrolled = newScroll > currentScroll;
      
      if (!scrolled) {
        console.log('⚠️  Scroll did not move, trying alternative scroll method');
        // Try alternative scroll method
        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight * 0.8);
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log(`📜 Scrolled from ${currentScroll} to ${newScroll}`);
      
    } catch (error) {
      console.log('⚠️  Scroll failed:', error.message);
    }
  }

  /**
   * End session
   */
  async endSession(sessionState, reason, startTime) {
    const duration = Date.now() - startTime;
    
    console.log(`🏁 Session ended: ${reason}, duration: ${Math.round(duration / 1000)}s`);
    console.log(`📊 Session stats:`, {
      postsSeen: sessionState.postsSeen,
      likesAttempted: sessionState.likesAttempted,
      likesSuccessful: sessionState.likesSuccessful,
      commentsOpened: sessionState.commentsOpened,
      profileHops: sessionState.profileHops
    });
    
    // Update session memory
    this.sessionMemory.updateLastSession(sessionState.profileId, {
      shape: sessionState.shape,
      mood: sessionState.mood,
      startTs: new Date(sessionState.startTime).toISOString(),
      endTs: new Date().toISOString(),
      likes: sessionState.likesSuccessful,
      reasonEnded: reason,
      duration: duration,
      scarcity: sessionState.scarcity,
      riskTier: sessionState.riskTier
    });
    
    // Update daily counters
    this.sessionMemory.updateDailyCounters(sessionState.profileId, {
      sessions: 1,
      likes: sessionState.likesSuccessful,
      comments: sessionState.commentsOpened,
      profileHops: sessionState.profileHops
    });
    
    return {
      success: true,
      sessionId: sessionState.sessionId,
      duration: duration,
      stats: {
        postsSeen: sessionState.postsSeen,
        likesAttempted: sessionState.likesAttempted,
        likesSuccessful: sessionState.likesSuccessful,
        commentsOpened: sessionState.commentsOpened,
        profileHops: sessionState.profileHops,
        saves: sessionState.saves
      },
      exitReason: reason,
      scarcity: sessionState.scarcity
    };
  }

  /**
   * Utility: random between min and max
   */
  randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  }
}

module.exports = HomeFeedScroller;
