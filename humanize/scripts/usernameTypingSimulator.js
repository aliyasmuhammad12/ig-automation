/**
 * Human-Like Username Typing Simulator
 * 
 * Simulates realistic human typing behavior for username input fields.
 * Includes variable speeds, pauses, mistakes, corrections, and persona-based behavior.
 * 
 * SAFETY: Only for internal use on allowlisted domains with strict guardrails.
 */

const { delay } = require('../../helpers/utils');
const { mobileClick } = require('../../helpers/mobileClick');

// ============================================================================
// PERSONA DEFINITIONS
// ============================================================================

const PERSONAS = {
  focused: {
    name: 'Focused',
    iki_median_ms: 190,
    iki_cv: 0.25,
    mistake_rate: 0.0045, // 0.45%
    pause_micro_prob: 0.12,
    pause_macro_prob: 0.03,
    delayed_correction_prob: 0.15,
    backspace_iki_ms: 140,
    char_multipliers: {
      digit: 1.15,
      underscore: 1.55,
      period: 1.20,
      uppercase: 1.25,
      shifted: 50
    }
  },
  careful: {
    name: 'Careful',
    iki_median_ms: 235,
    iki_cv: 0.30,
    mistake_rate: 0.007, // 0.7%
    pause_micro_prob: 0.18,
    pause_macro_prob: 0.04,
    delayed_correction_prob: 0.20,
    backspace_iki_ms: 160,
    char_multipliers: {
      digit: 1.20,
      underscore: 1.70,
      period: 1.25,
      uppercase: 1.30,
      shifted: 60
    }
  },
  rushed: {
    name: 'Rushed',
    iki_median_ms: 160,
    iki_cv: 0.20,
    mistake_rate: 0.009, // 0.9%
    pause_micro_prob: 0.08,
    pause_macro_prob: 0.02,
    delayed_correction_prob: 0.25,
    backspace_iki_ms: 120,
    char_multipliers: {
      digit: 1.10,
      underscore: 1.40,
      period: 1.15,
      uppercase: 1.20,
      shifted: 40
    }
  },
  distracted: {
    name: 'Distracted',
    iki_median_ms: 265,
    iki_cv: 0.35,
    mistake_rate: 0.0115, // 1.15%
    pause_micro_prob: 0.19,
    pause_macro_prob: 0.05,
    delayed_correction_prob: 0.30,
    backspace_iki_ms: 180,
    char_multipliers: {
      digit: 1.25,
      underscore: 1.80,
      period: 1.30,
      uppercase: 1.35,
      shifted: 70
    }
  },
  tired: {
    name: 'Tired',
    iki_median_ms: 290,
    iki_cv: 0.40,
    mistake_rate: 0.014, // 1.4%
    pause_micro_prob: 0.22,
    pause_macro_prob: 0.06,
    delayed_correction_prob: 0.35,
    backspace_iki_ms: 200,
    char_multipliers: {
      digit: 1.30,
      underscore: 1.85,
      period: 1.35,
      uppercase: 1.40,
      shifted: 80
    }
  },
  expert: {
    name: 'Expert',
    iki_median_ms: 170,
    iki_cv: 0.15,
    mistake_rate: 0.0035, // 0.35%
    pause_micro_prob: 0.06,
    pause_macro_prob: 0.015,
    delayed_correction_prob: 0.10,
    backspace_iki_ms: 130,
    char_multipliers: {
      digit: 1.12,
      underscore: 1.45,
      period: 1.18,
      uppercase: 1.22,
      shifted: 45
    }
  },
  novice: {
    name: 'Novice',
    iki_median_ms: 310,
    iki_cv: 0.45,
    mistake_rate: 0.0225, // 2.25%
    pause_micro_prob: 0.25,
    pause_macro_prob: 0.08,
    delayed_correction_prob: 0.40,
    backspace_iki_ms: 220,
    char_multipliers: {
      digit: 1.35,
      underscore: 1.90,
      period: 1.40,
      uppercase: 1.45,
      shifted: 90
    }
  }
};

// Persona distribution (desktop)
const PERSONA_DISTRIBUTION = {
  focused: 0.25,
  careful: 0.20,
  rushed: 0.15,
  distracted: 0.15,
  tired: 0.10,
  expert: 0.10,
  novice: 0.05
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate lognormal distribution sample
 */
function lognormalSample(median, cv) {
  const mu = Math.log(median);
  const sigma = Math.sqrt(Math.log(1 + cv * cv));
  const u = Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.exp(mu + sigma * z);
}

/**
 * Select random persona based on distribution
 */
function selectPersona(deviceProfile = 'desktop') {
  const rand = Math.random();
  let cumulative = 0;
  
  for (const [persona, weight] of Object.entries(PERSONA_DISTRIBUTION)) {
    cumulative += weight;
    if (rand <= cumulative) {
      return persona;
    }
  }
  
  return 'focused'; // fallback
}

/**
 * Get character type multiplier
 */
function getCharMultiplier(char, persona) {
  const multipliers = PERSONAS[persona].char_multipliers;
  
  if (/\d/.test(char)) return multipliers.digit;
  if (char === '_' || char === '-') return multipliers.underscore;
  if (char === '.') return multipliers.period;
  if (/[A-Z]/.test(char)) return multipliers.uppercase;
  
  return 1.0;
}

/**
 * Determine if character requires shift
 */
function requiresShift(char) {
  return /[A-Z]/.test(char);
}

/**
 * Generate mistake type
 */
function generateMistakeType() {
  const rand = Math.random();
  if (rand < 0.55) return 'adjacent';
  if (rand < 0.75) return 'double';
  if (rand < 0.85) return 'omission';
  return 'transposition';
}

/**
 * Get adjacent key for substitution
 */
function getAdjacentKey(char) {
  const adjacentMap = {
    'a': ['q', 's', 'z'],
    'b': ['v', 'g', 'n'],
    'c': ['x', 'v', 'd'],
    'd': ['s', 'e', 'r', 'f', 'c', 'x'],
    'e': ['w', 's', 'd', 'r'],
    'f': ['d', 'r', 't', 'g', 'v', 'c'],
    'g': ['f', 't', 'y', 'h', 'b', 'v'],
    'h': ['g', 'y', 'u', 'j', 'n', 'b'],
    'i': ['u', 'j', 'k', 'o'],
    'j': ['h', 'u', 'i', 'k', 'm', 'n'],
    'k': ['j', 'i', 'o', 'l', 'm'],
    'l': ['k', 'o', 'p'],
    'm': ['n', 'j', 'k'],
    'n': ['b', 'h', 'j', 'm'],
    'o': ['i', 'k', 'l', 'p'],
    'p': ['o', 'l'],
    'q': ['w', 'a'],
    'r': ['e', 'd', 'f', 't'],
    's': ['a', 'w', 'e', 'd', 'z', 'x'],
    't': ['r', 'f', 'g', 'y'],
    'u': ['y', 'h', 'j', 'i'],
    'v': ['c', 'd', 'f', 'g', 'b'],
    'w': ['q', 'a', 's', 'e'],
    'x': ['z', 's', 'd', 'c'],
    'y': ['t', 'g', 'h', 'u'],
    'z': ['a', 's', 'x']
  };
  
  const lowerChar = char.toLowerCase();
  const adjacent = adjacentMap[lowerChar];
  if (!adjacent) return char;
  
  return adjacent[Math.floor(Math.random() * adjacent.length)];
}

// ============================================================================
// MAIN TYPING SIMULATOR
// ============================================================================

class UsernameTypingSimulator {
  constructor(options = {}) {
    // Handle 'auto' persona selection
    if (options.persona === 'auto' || !options.persona) {
      this.persona = selectPersona(options.deviceProfile);
    } else {
      this.persona = options.persona;
    }
    
    this.deviceProfile = options.deviceProfile || 'desktop';
    this.seed = options.seed || Math.floor(Math.random() * 1000000);
    this.maxRuntime = options.maxRuntime || 30000; // 30 seconds
    this.deactivateOnUserInput = options.deactivateOnUserInput !== false;
    
    // Session state
    this.sessionStartTime = Date.now();
    this.charactersTyped = 0;
    this.mistakesMade = 0;
    this.correctionsMade = 0;
    this.pausesTaken = 0;
    
    // Fatigue tracking
    this.fatigueMultiplier = 1.0;
    this.mistakeRateMultiplier = 1.0;
    
    console.log(`[TypingSimulator] 🎭 Initialized with persona: ${PERSONAS[this.persona].name}`);
    console.log(`[TypingSimulator] 📱 Device profile: ${this.deviceProfile}`);
  }
  
  /**
   * Main typing function - replaces page.type()
   */
  async typeUsername(page, selector, username) {
    const startTime = Date.now();
    console.log(`[TypingSimulator] ⌨️ Starting human-like typing: "${username}"`);
    
    try {
      // Safety check
      if (Date.now() - this.sessionStartTime > this.maxRuntime) {
        throw new Error('Max runtime exceeded');
      }
      
      // Clear and focus input
      await this.prepareInput(page, selector);
      
      // Orientation delay (first keystroke)
      const orientationDelay = 250 + Math.random() * 350;
      console.log(`[TypingSimulator] 🎯 Orientation delay: ${orientationDelay.toFixed(0)}ms`);
      await delay(orientationDelay);
      
      // Type the username with human-like behavior
      const result = await this.typeWithHumanBehavior(page, selector, username);
      
      const totalTime = Date.now() - startTime;
      console.log(`[TypingSimulator] ✅ Completed typing in ${totalTime}ms`);
      console.log(`[TypingSimulator] 📊 Stats: ${this.mistakesMade} mistakes, ${this.correctionsMade} corrections, ${this.pausesTaken} pauses`);
      
      return result;
      
    } catch (error) {
      console.error(`[TypingSimulator] ❌ Error during typing: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Prepare input field for typing
   */
  async prepareInput(page, selector) {
    // Use mobile-appropriate click instead of center-clicking
    const clickSuccess = await mobileClick(page, selector, {
      waitForVisible: true,
      timeout: 5000,
      scrollIntoView: true,
      useTouch: true,
      addDelay: true
    });
    
    if (clickSuccess) {
      await page.evaluate((sel) => {
        const input = document.querySelector(sel);
        if (input) {
          input.value = '';
          input.focus();
        }
      }, selector);
    }
    
    await delay(100 + Math.random() * 200);
  }
  
  /**
   * Core typing with human behavior
   */
  async typeWithHumanBehavior(page, selector, username) {
    let currentText = '';
    let pendingCorrections = [];
    
    for (let i = 0; i < username.length; i++) {
      const char = username[i];
      const isFirstChar = i === 0;
      const isLastChar = i === username.length - 1;
      
      // Check for user input interruption
      if (this.deactivateOnUserInput) {
        const userInterrupted = await this.checkUserInput(page, selector, currentText);
        if (userInterrupted) {
          console.log(`[TypingSimulator] ⚠️ User input detected - halting simulation`);
          return { success: false, reason: 'user_input_detected' };
        }
      }
      
      // Apply fatigue drift
      this.updateFatigue();
      
      // Determine if we should make a mistake
      const shouldMakeMistake = this.shouldMakeMistake(char);
      
      if (shouldMakeMistake) {
        const mistakeResult = await this.handleMistake(page, selector, char, currentText, pendingCorrections);
        if (mistakeResult.correctionType === 'immediate') {
          currentText = mistakeResult.finalText;
        } else if (mistakeResult.correctionType === 'delayed') {
          pendingCorrections.push(mistakeResult);
        } else { // finish-then-correct
          pendingCorrections.push(mistakeResult);
        }
      } else {
        // Normal typing
        await this.typeCharacter(page, selector, char, isFirstChar, isLastChar);
        currentText += char;
        this.charactersTyped++;
      }
      
      // Handle delayed corrections
      pendingCorrections = await this.processDelayedCorrections(page, selector, pendingCorrections, currentText);
      
      // Check for pauses
      await this.handlePauses();
    }
    
    // Handle finish-then-correct mistakes
    await this.handleFinishThenCorrect(page, selector, pendingCorrections);
    
    // Finalization pause
    if (username.length > 0) {
      const finalizationPause = 150 + Math.random() * 250;
      console.log(`[TypingSimulator] 🎯 Finalization pause: ${finalizationPause.toFixed(0)}ms`);
      await delay(finalizationPause);
    }
    
    return { success: true, finalText: currentText };
  }
  
  /**
   * Type a single character with human-like timing
   */
  async typeCharacter(page, selector, char, isFirstChar, isLastChar) {
    // Get base timing from persona
    let baseIki = PERSONAS[this.persona].iki_median_ms;
    
    // Apply fatigue
    baseIki *= this.fatigueMultiplier;
    
    // Apply character modifiers
    const charMultiplier = getCharMultiplier(char, this.persona);
    baseIki *= charMultiplier;
    
    // Apply position modifiers
    if (isFirstChar) {
      baseIki *= 1.05; // First 2-4 chars slightly slower
    }
    
    // Generate actual timing with lognormal distribution
    const iki = lognormalSample(baseIki, PERSONAS[this.persona].iki_cv);
    
    // Add shift key delay if needed
    let totalDelay = iki;
    if (requiresShift(char)) {
      totalDelay += PERSONAS[this.persona].char_multipliers.shifted;
    }
    
    console.log(`[TypingSimulator] ⌨️ Typing "${char}" (IKI: ${iki.toFixed(0)}ms, total: ${totalDelay.toFixed(0)}ms)`);
    
    // Type the character
    await page.keyboard.type(char);
    await delay(totalDelay);
  }
  
  /**
   * Determine if we should make a mistake
   */
  shouldMakeMistake(char) {
    const baseRate = PERSONAS[this.persona].mistake_rate;
    const adjustedRate = baseRate * this.mistakeRateMultiplier;
    return Math.random() < adjustedRate;
  }
  
  /**
   * Handle mistake generation and correction
   */
  async handleMistake(page, selector, intendedChar, currentText, pendingCorrections) {
    this.mistakesMade++;
    const mistakeType = generateMistakeType();
    
    console.log(`[TypingSimulator] ❌ Making ${mistakeType} mistake for "${intendedChar}"`);
    
    let typedChar = intendedChar;
    let correctionType = 'immediate';
    
    switch (mistakeType) {
      case 'adjacent':
        typedChar = getAdjacentKey(intendedChar);
        break;
      case 'double':
        typedChar = intendedChar + intendedChar;
        break;
      case 'omission':
        typedChar = '';
        break;
      case 'transposition':
        if (currentText.length > 0) {
          const lastChar = currentText[currentText.length - 1];
          typedChar = intendedChar;
          // We'll handle transposition in correction
        }
        break;
    }
    
    // Type the mistake
    if (typedChar) {
      await page.keyboard.type(typedChar);
      await delay(PERSONAS[this.persona].backspace_iki_ms);
    }
    
    // Determine correction timing
    const correctionRand = Math.random();
    if (correctionRand < 0.75) {
      correctionType = 'immediate';
    } else if (correctionRand < 0.95) {
      correctionType = 'delayed';
    } else {
      correctionType = 'finish-then-correct';
    }
    
    if (correctionType === 'immediate') {
      return await this.correctMistake(page, selector, intendedChar, typedChar, currentText);
    } else {
      return {
        correctionType,
        intendedChar,
        typedChar,
        mistakeType,
        position: currentText.length
      };
    }
  }
  
  /**
   * Correct a mistake
   */
  async correctMistake(page, selector, intendedChar, typedChar, currentText) {
    this.correctionsMade++;
    
    // Determine correction scope
    let backspaceCount = 1;
    if (typedChar.length > 1) {
      backspaceCount = typedChar.length;
    }
    
    console.log(`[TypingSimulator] 🔄 Correcting mistake: backspace ${backspaceCount} chars`);
    
    // Backspace
    for (let i = 0; i < backspaceCount; i++) {
      await page.keyboard.press('Backspace');
      await delay(PERSONAS[this.persona].backspace_iki_ms);
    }
    
    // Type correct character
    await page.keyboard.type(intendedChar);
    await delay(PERSONAS[this.persona].backspace_iki_ms);
    
    // Post-correction pause
    const postCorrectionPause = 120 + Math.random() * 480;
    console.log(`[TypingSimulator] ⏸️ Post-correction pause: ${postCorrectionPause.toFixed(0)}ms`);
    await delay(postCorrectionPause);
    
    return {
      correctionType: 'immediate',
      finalText: currentText + intendedChar
    };
  }
  
  /**
   * Process delayed corrections
   */
  async processDelayedCorrections(page, selector, pendingCorrections, currentText) {
    const remaining = [];
    
    for (const correction of pendingCorrections) {
      if (correction.correctionType === 'delayed') {
        const shouldCorrect = Math.random() < 0.3; // 30% chance per character
        if (shouldCorrect) {
          await this.correctMistake(page, selector, correction.intendedChar, correction.typedChar, currentText);
        } else {
          remaining.push(correction);
        }
      } else {
        remaining.push(correction);
      }
    }
    
    return remaining;
  }
  
  /**
   * Handle finish-then-correct mistakes
   */
  async handleFinishThenCorrect(page, selector, pendingCorrections) {
    for (const correction of pendingCorrections) {
      if (correction.correctionType === 'finish-then-correct') {
        console.log(`[TypingSimulator] 🔄 Finish-then-correct: fixing "${correction.typedChar}" → "${correction.intendedChar}"`);
        await this.correctMistake(page, selector, correction.intendedChar, correction.typedChar, '');
      }
    }
  }
  
  /**
   * Handle pauses (micro and macro)
   */
  async handlePauses() {
    // Micro-pause
    if (Math.random() < PERSONAS[this.persona].pause_micro_prob) {
      const microPause = 120 + Math.random() * 280;
      console.log(`[TypingSimulator] ⏸️ Micro-pause: ${microPause.toFixed(0)}ms`);
      await delay(microPause);
      this.pausesTaken++;
    }
    
    // Macro-pause (less frequent)
    if (Math.random() < PERSONAS[this.persona].pause_macro_prob) {
      const macroPause = 350 + Math.random() * 550;
      console.log(`[TypingSimulator] ⏸️ Macro-pause: ${macroPause.toFixed(0)}ms`);
      await delay(macroPause);
      this.pausesTaken++;
    }
  }
  
  /**
   * Update fatigue over time
   */
  updateFatigue() {
    // Fatigue increases every 5-8 characters
    if (this.charactersTyped > 0 && this.charactersTyped % 6 === 0) {
      this.fatigueMultiplier += 0.01; // +1% IKI
      this.mistakeRateMultiplier += 0.05; // +5% mistake rate
      
      // Cap fatigue
      this.fatigueMultiplier = Math.min(this.fatigueMultiplier, 1.15);
      this.mistakeRateMultiplier = Math.min(this.mistakeRateMultiplier, 1.4);
      
      console.log(`[TypingSimulator] 😴 Fatigue update: IKI +${((this.fatigueMultiplier - 1) * 100).toFixed(1)}%, mistakes +${((this.mistakeRateMultiplier - 1) * 100).toFixed(1)}%`);
    }
  }
  
  /**
   * Check if user has interrupted typing
   */
  async checkUserInput(page, selector, currentText) {
    try {
      const currentValue = await page.evaluate((sel) => {
        const input = document.querySelector(sel);
        return input ? input.value : '';
      }, selector);
      
      // If current value doesn't match what we've typed, user intervened
      return currentValue !== currentText;
    } catch (error) {
      return false;
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  UsernameTypingSimulator,
  PERSONAS,
  PERSONA_DISTRIBUTION,
  lognormalSample,
  selectPersona,
  getCharMultiplier,
  requiresShift,
  generateMistakeType,
  getAdjacentKey
};
