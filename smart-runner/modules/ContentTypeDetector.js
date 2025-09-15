const fs = require('fs').promises;
const path = require('path');

class ContentTypeDetector {
  constructor(configPath) {
    this.configPath = configPath;
    this.config = null;
  }

  async initialize() {
    try {
      this.config = JSON.parse(await fs.readFile(path.join(this.configPath, 'content-types.json'), 'utf8'));
      console.log('🔍 Content Type Detector initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Content Type Detector:', error.message);
      throw error;
    }
  }

  /**
   * Analyze feed content to detect scarcity and content types
   */
  async analyzeFeed(page, sessionMemory) {
    const startTime = Date.now();
    const maxScanTime = this.config.contentAnalysis.maxScanTime;
    
    try {
      console.log('🔍 Starting feed content analysis...');
      
      // Wait for initial load
      await this.waitForInitialLoad(page);
      
      // Perform pull-to-refresh if configured
      if (Math.random() < 0.15) {
        await this.performPullToRefresh(page);
      }
      
      // Scan posts for content type analysis
      const analysis = await this.scanPostsForAnalysis(page);
      
      // Detect scarcity
      const scarcity = this.detectScarcity(analysis);
      
      // Check for "Caught Up" state
      const caughtUp = await this.detectCaughtUp(page);
      
      const result = {
        scarcity,
        caughtUp,
        analysis,
        scanTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
      
      console.log(`📊 Feed analysis complete: scarcity=${scarcity}, caughtUp=${caughtUp}, posts=${analysis.totalPosts}`);
      return result;
      
    } catch (error) {
      console.error('❌ Feed analysis failed:', error.message);
      return {
        scarcity: false,
        caughtUp: false,
        analysis: { totalPosts: 0, followed: 0, suggested: 0, ads: 0 },
        error: error.message,
        scanTime: Date.now() - startTime
      };
    }
  }

  /**
   * Wait for initial page load
   */
  async waitForInitialLoad(page) {
    try {
      // Wait for posts to appear
      await page.waitForSelector(this.config.detection.followedSelectors[0], { 
        timeout: this.config.contentAnalysis.postDetectionTimeout 
      });
      
      // Additional wait for content to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.log('⚠️  Initial load timeout, proceeding with analysis');
    }
  }

  /**
   * Perform pull-to-refresh gesture
   */
  async performPullToRefresh(page) {
    try {
      console.log('🔄 Performing pull-to-refresh...');
      
      // Simulate pull-to-refresh gesture
      const viewport = await page.viewport();
      const startY = viewport.height * 0.3;
      const endY = viewport.height * 0.1;
      
      await page.mouse.move(viewport.width / 2, startY);
      await page.mouse.down();
      await page.mouse.move(viewport.width / 2, endY, { steps: 10 });
      await page.mouse.up();
      
      // Wait for refresh to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.log('⚠️  Pull-to-refresh failed:', error.message);
    }
  }

  /**
   * Scan posts for content type analysis
   */
  async scanPostsForAnalysis(page) {
    const analysis = {
      totalPosts: 0,
      followed: 0,
      suggested: 0,
      ads: 0,
      posts: []
    };
    
    try {
      // Wait for posts to load first
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Try multiple selectors to find posts
      const postSelectors = [
        'article[role="presentation"]',
        'article',
        'div[role="presentation"]',
        '[data-testid="post"]',
        'div[style*="position: relative"]'
      ];
      
      let posts = [];
      let usedSelector = '';
      
      for (const selector of postSelectors) {
        posts = await page.$$(selector);
        if (posts.length > 0) {
          usedSelector = selector;
          break;
        }
      }
      
      analysis.totalPosts = posts.length;
      console.log(`📱 Found ${posts.length} posts for analysis using selector: ${usedSelector}`);
      
      // Debug: Check what selectors are available
      if (posts.length === 0) {
        console.log('🔍 Debug: Checking available elements...');
        const allArticles = await page.$$('article');
        const allDivs = await page.$$('div[role="presentation"]');
        const allPosts = await page.$$('[data-testid="post"]');
        const allRelativeDivs = await page.$$('div[style*="position: relative"]');
        console.log(`📊 Available elements: articles=${allArticles.length}, divs=${allDivs.length}, posts=${allPosts.length}, relativeDivs=${allRelativeDivs.length}`);
        
        // Try scrolling to trigger more content loading
        console.log('📜 Scrolling to trigger content loading...');
        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight * 0.8);
        });
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check again after scroll
        for (const selector of postSelectors) {
          posts = await page.$$(selector);
          if (posts.length > 0) {
            usedSelector = selector;
            analysis.totalPosts = posts.length;
            console.log(`📱 Found ${posts.length} posts after scroll using selector: ${usedSelector}`);
            break;
          }
        }
      }
      
      // Analyze each post
      for (let i = 0; i < Math.min(posts.length, this.config.scarcityThresholds.scanPosts); i++) {
        const post = posts[i];
        const postType = await this.classifyPost(post, page);
        
        analysis.posts.push({
          index: i,
          type: postType,
          timestamp: new Date().toISOString()
        });
        
        analysis[postType]++;
        
        // Scroll to next post if not last
        if (i < posts.length - 1) {
          await this.scrollToNextPost(page);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // Calculate ratios
      analysis.followedRatio = analysis.followed / analysis.totalPosts;
      analysis.suggestedRatio = analysis.suggested / analysis.totalPosts;
      analysis.adRatio = analysis.ads / analysis.totalPosts;
      
    } catch (error) {
      console.error('❌ Post analysis failed:', error.message);
    }
    
    return analysis;
  }

  /**
   * Classify individual post type
   */
  async classifyPost(postElement, page) {
    try {
      // Check for ad indicators
      const adIndicators = await this.checkForAdIndicators(postElement, page);
      if (adIndicators) {
        return 'ads';
      }
      
      // Check for suggested post indicators
      const suggestedIndicators = await this.checkForSuggestedIndicators(postElement, page);
      if (suggestedIndicators) {
        return 'suggested';
      }
      
      // Default to followed (posts from accounts you follow)
      return 'followed';
      
    } catch (error) {
      console.log('⚠️  Post classification failed:', error.message);
      return 'followed'; // Default fallback
    }
  }

  /**
   * Check for ad indicators
   */
  async checkForAdIndicators(postElement, page) {
    try {
      // Check for sponsored text
      const sponsoredText = await postElement.$eval('*', (el) => {
        const text = el.textContent || '';
        return text.toLowerCase().includes('sponsored') || 
               text.toLowerCase().includes('advertisement') ||
               text.toLowerCase().includes('promoted');
      }).catch(() => false);
      
      if (sponsoredText) return true;
      
      // Check for ad-specific selectors
      for (const selector of this.config.detection.adSelectors) {
        const adElement = await postElement.$(selector).catch(() => null);
        if (adElement) return true;
      }
      
      return false;
      
    } catch (error) {
      return false;
    }
  }

  /**
   * Check for suggested post indicators
   */
  async checkForSuggestedIndicators(postElement, page) {
    try {
      // Check for suggested text
      const suggestedText = await postElement.$eval('*', (el) => {
        const text = el.textContent || '';
        return text.toLowerCase().includes('suggested') || 
               text.toLowerCase().includes('recommended') ||
               text.toLowerCase().includes('for you');
      }).catch(() => false);
      
      if (suggestedText) return true;
      
      // Check for suggested-specific selectors
      for (const selector of this.config.detection.suggestedSelectors) {
        const suggestedElement = await postElement.$(selector).catch(() => null);
        if (suggestedElement) return true;
      }
      
      return false;
      
    } catch (error) {
      return false;
    }
  }

  /**
   * Detect scarcity based on analysis
   */
  detectScarcity(analysis) {
    const thresholds = this.config.scarcityThresholds;
    
    // Check if we have enough posts for analysis
    if (analysis.totalPosts < thresholds.minPostsForAnalysis) {
      return false;
    }
    
    // Check scarcity conditions
    const followedTooLow = analysis.followedRatio < thresholds.followedMin;
    const suggestedTooHigh = analysis.suggestedRatio >= thresholds.suggestedMax;
    
    return followedTooLow || suggestedTooHigh;
  }

  /**
   * Detect "Caught Up" state
   */
  async detectCaughtUp(page) {
    try {
      for (const selector of this.config.detection.caughtUpSelectors) {
        const element = await page.$(selector).catch(() => null);
        if (element) {
          console.log('✅ "Caught Up" state detected');
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Scroll to next post
   */
  async scrollToNextPost(page) {
    try {
      const viewport = await page.viewport();
      const scrollDistance = viewport.height * 0.8;
      
      await page.evaluate((distance) => {
        window.scrollBy(0, distance);
      }, scrollDistance);
      
    } catch (error) {
      console.log('⚠️  Scroll failed:', error.message);
    }
  }

  /**
   * Check if Following feed is available
   */
  async checkFollowingFeedAvailable(page) {
    try {
      for (const selector of this.config.detection.followingFeedSelectors) {
        const element = await page.$(selector).catch(() => null);
        if (element) {
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Navigate to Following feed
   */
  async navigateToFollowingFeed(page) {
    try {
      console.log('📱 Navigating to Following feed...');
      
      for (const selector of this.config.detection.followingFeedSelectors) {
        const element = await page.$(selector).catch(() => null);
        if (element) {
          await element.click();
          await new Promise(resolve => setTimeout(resolve, 2000));
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.log('⚠️  Following feed navigation failed:', error.message);
      return false;
    }
  }

  /**
   * Detect content stall (spinner/loading)
   */
  async detectContentStall(page) {
    try {
      // Check for loading spinners (more specific selectors)
      const spinnerSelectors = [
        '[data-testid="loading"]',
        '[aria-label*="Loading"]',
        '[aria-label*="loading"]',
        '.loading',
        '.spinner'
      ];
      
      for (const selector of spinnerSelectors) {
        const spinner = await page.$(selector).catch(() => null);
        if (spinner) {
          console.log(`⚠️  Content stall detected: spinner found with selector ${selector}`);
          return true;
        }
      }
      
      // Check for loading text (more specific)
      const loadingText = await page.evaluate(() => {
        const text = document.body.textContent || '';
        const loadingKeywords = ['loading', 'please wait', 'loading more', 'loading posts'];
        return loadingKeywords.some(keyword => text.toLowerCase().includes(keyword));
      }).catch(() => false);
      
      if (loadingText) {
        console.log('⚠️  Content stall detected: loading text found');
        return true;
      }
      
      // Check if page is stuck (no new content after scroll)
      const hasNewContent = await page.evaluate(() => {
        const posts = document.querySelectorAll('article, [data-testid="post"]');
        return posts.length > 0;
      }).catch(() => false);
      
      if (!hasNewContent) {
        console.log('⚠️  Content stall detected: no posts found');
        return true;
      }
      
      return false;
    } catch (error) {
      console.log('⚠️  Content stall detection error:', error.message);
      return false;
    }
  }

  /**
   * Get post metadata for logging
   */
  async getPostMetadata(postElement, page) {
    try {
      const metadata = await postElement.evaluate((el) => {
        // Extract post ID, username, timestamp, etc.
        const postId = el.getAttribute('data-testid') || el.id || 'unknown';
        const username = el.querySelector('[data-testid="user-name"]')?.textContent || 'unknown';
        const timestamp = el.querySelector('time')?.getAttribute('datetime') || 'unknown';
        
        return {
          postId,
          username,
          timestamp,
          elementId: el.id
        };
      });
      
      return metadata;
    } catch (error) {
      return {
        postId: 'unknown',
        username: 'unknown',
        timestamp: 'unknown',
        elementId: 'unknown'
      };
    }
  }
}

module.exports = ContentTypeDetector;
