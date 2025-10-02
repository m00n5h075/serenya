/**
 * Static Chat Prompts Configuration
 * Replaces database queries for chat_options table
 */

const CHAT_PROMPTS = {
  result: [
    {
      id: 1,
      content_type: 'result',
      category: 'general',
      prompt_text: 'What do my test results mean?',
      display_order: 1,
      has_sub_options: false
    },
    {
      id: 2,
      content_type: 'result',
      category: 'general',
      prompt_text: 'Are any of my values concerning?',
      display_order: 2,
      has_sub_options: false
    },
    {
      id: 3,
      content_type: 'result',
      category: 'general',
      prompt_text: 'What should I discuss with my doctor?',
      display_order: 3,
      has_sub_options: false
    },
    {
      id: 4,
      content_type: 'result',
      category: 'specific',
      prompt_text: 'Explain my cholesterol levels',
      display_order: 4,
      has_sub_options: false
    },
    {
      id: 5,
      content_type: 'result',
      category: 'specific',
      prompt_text: 'What about my blood sugar?',
      display_order: 5,
      has_sub_options: false
    },
    {
      id: 6,
      content_type: 'result',
      category: 'lifestyle',
      prompt_text: 'How can I improve these results?',
      display_order: 6,
      has_sub_options: false
    }
  ],
  report: [
    {
      id: 7,
      content_type: 'report',
      category: 'general',
      prompt_text: 'What are the key trends in my health data?',
      display_order: 1,
      has_sub_options: false
    },
    {
      id: 8,
      content_type: 'report',
      category: 'general',
      prompt_text: 'How has my health changed over time?',
      display_order: 2,
      has_sub_options: false
    },
    {
      id: 9,
      content_type: 'report',
      category: 'general',
      prompt_text: 'What patterns should I be aware of?',
      display_order: 3,
      has_sub_options: false
    },
    {
      id: 10,
      content_type: 'report',
      category: 'specific',
      prompt_text: 'Tell me about my cardiovascular trends',
      display_order: 4,
      has_sub_options: false
    },
    {
      id: 11,
      content_type: 'report',
      category: 'specific',
      prompt_text: 'What about my metabolic health progression?',
      display_order: 5,
      has_sub_options: false
    },
    {
      id: 12,
      content_type: 'report',
      category: 'actionable',
      prompt_text: 'What questions should I ask my doctor?',
      display_order: 6,
      has_sub_options: false
    }
  ]
};

/**
 * Get chat prompts by content type
 * @param {string} contentType - 'result' or 'report'
 * @returns {Array} Array of prompt objects
 */
function getChatPrompts(contentType) {
  if (!contentType || !['result', 'report'].includes(contentType)) {
    throw new Error('Invalid content type. Must be "result" or "report"');
  }
  
  return CHAT_PROMPTS[contentType] || [];
}

/**
 * Get prompt by ID
 * @param {number} promptId - The prompt ID
 * @returns {Object|null} Prompt object or null if not found
 */
function getPromptById(promptId) {
  const allPrompts = [...CHAT_PROMPTS.result, ...CHAT_PROMPTS.report];
  return allPrompts.find(prompt => prompt.id === promptId) || null;
}

module.exports = {
  getChatPrompts,
  getPromptById,
  CHAT_PROMPTS
};