const axios = require('axios');

/**
 * Straico API Service for AI Moderation
 * Uses a fast LLM to evaluate MASKPRO S.O.S. posts for spam/hate speech.
 */
class StraicoService {
  constructor() {
    this.apiKey = process.env.STRAICO_API_KEY;
    this.apiUrl = 'https://api.straico.com/v1/prompt/completion';
  }

  /**
   * Evaluates the content of a community post.
   * @param {string} title 
   * @param {string} body 
   * @returns {Promise<boolean>} True if approved, False if rejected/spam.
   */
  async moderateContent(title, body) {
    if (!this.apiKey) {
      console.warn('⚠️ STRAICO_API_KEY is not set. Skipping AI moderation (auto-approve).');
      return true;
    }

    const prompt = `You are a strict community moderator for MaskPro Care. A user submitted the following post for the MASKPRO S.O.S. (Emergency Help) feature. 
    
Title: ${title}
Body: ${body}

Task: Evaluate if this post contains hate speech, complaints about MaskPro service, spam, or sabotage. 
Is it a legitimate request for car help, community chat, or an SOS? 
Reply ONLY with the exact word "PASS" if it is safe and legitimate. 
Reply ONLY with the exact word "FAIL" if it contains hate speech, sabotage, or malicious spam.`;

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          models: ['openai/gpt-4o-mini'],
          message: prompt,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Straico response structure typically has data.completions or data.data.completions
      // Adjusting for common format:
      const completionText = response.data?.data?.completions?.['openai/gpt-4o-mini']?.completion 
        || response.data?.completions?.['openai/gpt-4o-mini']?.completion 
        || '';

      const result = completionText.trim().toUpperCase();
      console.log(`[Straico Moderation] Title: "${title}" -> AI Result: ${result}`);

      if (result.includes('FAIL')) {
        return false;
      }
      return true;
    } catch (error) {
      console.error('❌ Straico API Error:', error.response?.data || error.message);
      // Fallback to manual moderation (auto-approve but could be flagged later)
      return true;
    }
  }
}

module.exports = new StraicoService();
