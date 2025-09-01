const { delay } = require('./utils');

/**
 * Human-like mobile click utility
 * Replaces center-clicking with natural mobile touch interactions
 */

/**
 * Get random position within element bounds (avoiding exact center)
 * @param {Object} boundingBox - Element bounding box from Puppeteer
 * @returns {Object} {x, y} coordinates for click
 */
function getRandomClickPosition(boundingBox) {
  // Avoid exact center (0.5, 0.5) - use 30-70% range for more natural feel
  const xRatio = 0.3 + (Math.random() * 0.4); // 30-70% of width
  const yRatio = 0.3 + (Math.random() * 0.4); // 30-70% of height
  
  return {
    x: boundingBox.x + (boundingBox.width * xRatio),
    y: boundingBox.y + (boundingBox.height * yRatio)
  };
}

/**
 * Add small random delay before click (human-like thinking)
 * @returns {Promise} Random delay
 */
async function preClickDelay() {
  const thinkingTime = 100 + (Math.random() * 300); // 100-400ms thinking
  await delay(thinkingTime);
}

/**
 * Human-like mobile click with touch simulation
 * @param {Page} page - Puppeteer page object
 * @param {string|ElementHandle} selector - CSS selector or element handle
 * @param {Object} options - Click options
 * @returns {Promise<boolean>} Success status
 */
async function mobileClick(page, selector, options = {}) {
  try {
    const {
      waitForVisible = true,
      timeout = 10000,
      scrollIntoView = true,
      useTouch = true,
      addDelay = true
    } = options;

    let element;
    
    // Handle both selector string and element handle
    if (typeof selector === 'string') {
      if (waitForVisible) {
        await page.waitForSelector(selector, { visible: true, timeout });
      }
      element = await page.$(selector);
    } else {
      element = selector;
    }

    if (!element) {
      console.warn('[mobileClick] Element not found:', selector);
      return false;
    }

    // Get element bounds
    const boundingBox = await element.boundingBox();
    if (!boundingBox) {
      console.warn('[mobileClick] Could not get element bounds');
      return false;
    }

    // Scroll into view if requested
    if (scrollIntoView) {
      await element.evaluate(el => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      await delay(200); // Small delay for scroll animation
    }

    // Add human-like thinking delay
    if (addDelay) {
      await preClickDelay();
    }

    // Get random click position (avoiding exact center)
    const clickPos = getRandomClickPosition(boundingBox);

    if (useTouch) {
      // Mobile touch simulation
      await page.touchscreen.tap(clickPos.x, clickPos.y);
    } else {
      // Fallback to mouse click
      await page.mouse.click(clickPos.x, clickPos.y);
    }

    // Small post-click delay
    await delay(100 + (Math.random() * 200));

    return true;
  } catch (error) {
    console.error('[mobileClick] Error:', error.message);
    return false;
  }
}

/**
 * Human-like mobile click with DOM evaluation (for complex elements)
 * @param {Page} page - Puppeteer page object
 * @param {string} selector - CSS selector
 * @param {Function} clickFunction - Custom click logic
 * @param {Object} options - Click options
 * @returns {Promise<boolean>} Success status
 */
async function mobileClickEval(page, selector, clickFunction, options = {}) {
  try {
    const {
      waitForVisible = true,
      timeout = 10000,
      scrollIntoView = true,
      addDelay = true
    } = options;

    if (waitForVisible) {
      await page.waitForSelector(selector, { visible: true, timeout });
    }

    // Add human-like thinking delay
    if (addDelay) {
      await preClickDelay();
    }

    // Execute click with custom logic
    const result = await page.evaluate((sel, clickFn, scroll) => {
      const element = document.querySelector(sel);
      if (!element) return { success: false, error: 'Element not found' };

      try {
        if (scroll) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        // Execute the custom click function
        const clickResult = clickFn(element);
        return { success: true, result: clickResult };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }, selector, clickFunction.toString(), scrollIntoView);

    if (!result.success) {
      console.warn('[mobileClickEval] Click failed:', result.error);
      return false;
    }

    // Small post-click delay
    await delay(100 + (Math.random() * 200));

    return true;
  } catch (error) {
    console.error('[mobileClickEval] Error:', error.message);
    return false;
  }
}

/**
 * Human-like mobile double tap (for mobile-specific actions)
 * @param {Page} page - Puppeteer page object
 * @param {string|ElementHandle} selector - CSS selector or element handle
 * @param {Object} options - Double tap options
 * @returns {Promise<boolean>} Success status
 */
async function mobileDoubleTap(page, selector, options = {}) {
  try {
    const {
      waitForVisible = true,
      timeout = 10000,
      scrollIntoView = true,
      addDelay = true
    } = options;

    let element;
    
    if (typeof selector === 'string') {
      if (waitForVisible) {
        await page.waitForSelector(selector, { visible: true, timeout });
      }
      element = await page.$(selector);
    } else {
      element = selector;
    }

    if (!element) {
      console.warn('[mobileDoubleTap] Element not found:', selector);
      return false;
    }

    const boundingBox = await element.boundingBox();
    if (!boundingBox) {
      console.warn('[mobileDoubleTap] Could not get element bounds');
      return false;
    }

    if (scrollIntoView) {
      await element.evaluate(el => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      await delay(200);
    }

    if (addDelay) {
      await preClickDelay();
    }

    const clickPos = getRandomClickPosition(boundingBox);

    // First tap
    await page.touchscreen.tap(clickPos.x, clickPos.y);
    await delay(50 + (Math.random() * 100)); // Natural double-tap timing
    
    // Second tap
    await page.touchscreen.tap(clickPos.x, clickPos.y);

    await delay(100 + (Math.random() * 200));
    return true;
  } catch (error) {
    console.error('[mobileDoubleTap] Error:', error.message);
    return false;
  }
}

module.exports = {
  mobileClick,
  mobileClickEval,
  mobileDoubleTap,
  getRandomClickPosition,
  preClickDelay
};
