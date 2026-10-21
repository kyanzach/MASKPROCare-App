const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

/**
 * OpenAI API Service for AI Moderation in MaskPro Care
 * Uses ultra-fast, cost-effective gpt-4o-mini to evaluate MASKPRO S.O.S. posts for spam/hate speech.
 */
class OpenAIService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || process.env.STRAICO_API_KEY;
    this.apiUrl = 'https://api.openai.com/v1/chat/completions';
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }

  /**
   * Evaluates the content of a community post.
   * @param {string} title 
   * @param {string} body 
   * @returns {Promise<boolean>} True if approved, False if rejected/spam.
   */
  async moderateContent(title, body) {
    if (!this.apiKey) {
      console.warn('⚠️ OPENAI_API_KEY is not set. Skipping AI moderation (auto-approve).');
      return true;
    }

    const systemPrompt = `You are a strict community moderator for MaskPro Care. A user submitted the following post for the MASKPRO S.O.S. (Emergency Help) feature.

Task: Evaluate if this post contains hate speech, complaints about MaskPro service, spam, or sabotage.
Is it a legitimate request for car help, community chat, or an SOS?
Reply ONLY with the exact word "PASS" if it is safe and legitimate.
Reply ONLY with the exact word "FAIL" if it contains hate speech, sabotage, or malicious spam.`;

    const userPrompt = `Title: ${title}\nBody: ${body}`;

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 10,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      const completionText = response.data?.choices?.[0]?.message?.content || '';
      const result = completionText.trim().toUpperCase();
      console.log(`[AI Moderation] Title: "${title}" -> Result: ${result}`);

      if (result.includes('FAIL')) {
        return false;
      }
      return true;
    } catch (error) {
      console.error('❌ AI Moderation Error:', error.response?.data || error.message);
      // Fallback to auto-approve
      return true;
    }
  }
}

module.exports = new OpenAIService();
