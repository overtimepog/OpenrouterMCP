/**
 * Token counting utility for estimating token counts in messages.
 * Uses a simple estimation algorithm based on character and word patterns.
 *
 * The algorithm is designed to approximate GPT-style tokenization
 * without requiring the actual tiktoken library dependency.
 */

import { SessionMessage } from './types.js';

/**
 * Average characters per token for different content types
 * These values are empirically derived from analyzing tokenization patterns
 */
const CHARS_PER_TOKEN = {
  english: 4,      // Average for English text
  code: 3,         // Code tends to tokenize more densely
  mixed: 3.5,      // Mixed content
};

/**
 * Overhead tokens for message structure
 */
const MESSAGE_OVERHEAD = {
  role: 2,         // Tokens for role indicator
  separator: 2,    // Tokens for message separators
  toolCall: 10,    // Base overhead for tool calls
};

export class TokenCounter {
  /**
   * Estimate the token count for a single string
   */
  estimateTokens(text: string): number {
    if (!text || text.length === 0) {
      return 0;
    }

    // Detect content type for better estimation
    const charsPerToken = this.detectContentType(text);

    // Base calculation from character count
    let tokens = Math.ceil(text.length / charsPerToken);

    // Adjust for word boundaries - tokens often align with words
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const wordBasedEstimate = Math.ceil(wordCount * 1.3); // Average 1.3 tokens per word

    // Use the higher estimate to be conservative
    tokens = Math.max(tokens, wordBasedEstimate);

    // Account for special characters and punctuation
    const specialChars = (text.match(/[^\w\s]/g) || []).length;
    tokens += Math.floor(specialChars * 0.3);

    // Minimum of 1 token for non-empty content
    return Math.max(1, tokens);
  }

  /**
   * Detect the type of content for better estimation
   */
  private detectContentType(text: string): number {
    // Check for code patterns
    const codePatterns = /[{}[\]();=><]|function|const|let|var|class|import|export|def |if |for |while /;
    const hasCodePatterns = codePatterns.test(text);

    // Check if primarily ASCII English
    const asciiRatio = (text.match(/[\x00-\x7F]/g) || []).length / text.length;

    if (hasCodePatterns) {
      return CHARS_PER_TOKEN.code;
    }

    if (asciiRatio > 0.9) {
      return CHARS_PER_TOKEN.english;
    }

    return CHARS_PER_TOKEN.mixed;
  }

  /**
   * Estimate the token count for content that may be a string or ContentPart array
   */
  estimateContentTokens(content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>): number {
    if (typeof content === 'string') {
      return this.estimateTokens(content);
    }

    let tokens = 0;
    for (const part of content) {
      if (part.type === 'text' && part.text) {
        tokens += this.estimateTokens(part.text);
      } else if (part.type === 'image_url') {
        // Flat cost per image (matches OpenAI's low-detail estimate)
        tokens += 85;
      }
    }
    return tokens;
  }

  /**
   * Estimate the token count for a single message
   */
  estimateMessageTokens(message: SessionMessage): number {
    let tokens = MESSAGE_OVERHEAD.role + MESSAGE_OVERHEAD.separator;

    // Count content tokens
    tokens += this.estimateContentTokens(message.content);

    // Count name tokens if present
    if (message.name) {
      tokens += this.estimateTokens(message.name) + 1;
    }

    // Count tool call ID if present
    if (message.tool_call_id) {
      tokens += this.estimateTokens(message.tool_call_id) + 1;
    }

    // Count tool calls if present
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        tokens += MESSAGE_OVERHEAD.toolCall;
        tokens += this.estimateTokens(toolCall.id);
        tokens += this.estimateTokens(toolCall.function.name);
        tokens += this.estimateTokens(toolCall.function.arguments);
      }
    }

    return tokens;
  }

  /**
   * Estimate the total token count for an array of messages
   */
  estimateMessagesTokens(messages: SessionMessage[]): number {
    let total = 0;

    for (const message of messages) {
      total += this.estimateMessageTokens(message);
    }

    // Add base conversation overhead
    total += 3; // Typical overhead for conversation structure

    return total;
  }

  /**
   * Estimate tokens for a model response (for tracking cumulative usage)
   * This includes both the prompt and expected response overhead
   */
  estimateResponseOverhead(expectedMaxTokens?: number): number {
    // Default response buffer if max_tokens not specified
    const responseBuffer = expectedMaxTokens ?? 1000;
    return responseBuffer;
  }
}

// Export a singleton instance for convenience
export const tokenCounter = new TokenCounter();

export default TokenCounter;
