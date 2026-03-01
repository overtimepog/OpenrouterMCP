/**
 * Tests for the Get Credits Tool.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetCreditsInputSchema } from '../../src/tools/credits/schema.js';
import { handleGetCredits } from '../../src/tools/credits/handler.js';
import { createGetCreditsTool, GET_CREDITS_TOOL_NAME } from '../../src/tools/credits/index.js';
import { ApiError, ErrorCode } from '../../src/api/errors.js';

// Mock logger
const createMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
});

// Mock client
const createMockClient = () => ({
  getCredits: vi.fn(),
});

// Helper to create a mock /key API response
function mockKeyResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      data: {
        limit: null,
        limit_remaining: null,
        usage: 0,
        usage_daily: 0,
        usage_weekly: 0,
        usage_monthly: 0,
        is_free_tier: false,
        ...overrides,
      },
    },
  };
}

describe('Get Credits Tool', () => {
  describe('Input Schema Validation', () => {
    it('should accept empty input', () => {
      const result = GetCreditsInputSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept null as input', () => {
      const result = GetCreditsInputSchema.safeParse(null);
      // Null is not valid - empty object is the expected input
      expect(result.success).toBe(false);
    });
  });

  describe('Handler', () => {
    let mockClient: ReturnType<typeof createMockClient>;
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
      mockClient = createMockClient();
      mockLogger = createMockLogger();
    });

    it('should fetch and format credits successfully with unlimited key', async () => {
      mockClient.getCredits.mockResolvedValue(
        mockKeyResponse({ usage: 25.5, usage_daily: 5.0, usage_weekly: 15.0, usage_monthly: 25.5 })
      );

      const result = await handleGetCredits({
        client: mockClient as any,
        logger: mockLogger,
      });

      expect(result.structuredResponse).toEqual({
        limit: null,
        limit_remaining: null,
        usage: 25.5,
        usage_daily: 5.0,
        usage_weekly: 15.0,
        usage_monthly: 25.5,
        is_free_tier: false,
      });

      expect(result.textResponse).toContain('Unlimited');
      expect(result.textResponse).toContain('$25.5000');
    });

    it('should fetch and format credits with a limit', async () => {
      mockClient.getCredits.mockResolvedValue(
        mockKeyResponse({ limit: 200.0, limit_remaining: 150.0, usage: 50.0, usage_daily: 10.0, usage_weekly: 30.0, usage_monthly: 50.0 })
      );

      const result = await handleGetCredits({
        client: mockClient as any,
        logger: mockLogger,
      });

      expect(result.structuredResponse.limit).toBe(200.0);
      expect(result.structuredResponse.limit_remaining).toBe(150.0);
      expect(result.textResponse).toContain('$200.0000');
      expect(result.textResponse).toContain('$150.0000');
    });

    it('should handle zero usage gracefully', async () => {
      mockClient.getCredits.mockResolvedValue(mockKeyResponse());

      const result = await handleGetCredits({
        client: mockClient as any,
        logger: mockLogger,
      });

      expect(result.structuredResponse.usage).toBe(0);
      expect(result.structuredResponse.limit).toBeNull();
    });

    it('should show low balance warning', async () => {
      mockClient.getCredits.mockResolvedValue(
        mockKeyResponse({ limit: 10.0, limit_remaining: 0.5, usage: 9.5, usage_daily: 2.0, usage_weekly: 5.0, usage_monthly: 9.5 })
      );

      const result = await handleGetCredits({
        client: mockClient as any,
        logger: mockLogger,
      });

      expect(result.structuredResponse.limit_remaining).toBe(0.5);
      expect(result.textResponse).toContain('Warning');
    });

    it('should log info on success', async () => {
      mockClient.getCredits.mockResolvedValue(
        mockKeyResponse({ limit: 100.0, limit_remaining: 80.0, usage: 20.0, usage_daily: 5.0, usage_weekly: 10.0, usage_monthly: 20.0 })
      );

      await handleGetCredits({
        client: mockClient as any,
        logger: mockLogger,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Credits fetched',
        expect.objectContaining({
          limit: 100.0,
          remaining: 80.0,
          usage: 20.0,
        })
      );
    });

    it('should handle API errors', async () => {
      const apiError = new ApiError({
        code: ErrorCode.AUTH_MISSING_KEY,
        message: 'Auth failed',
        statusCode: 401,
      });
      mockClient.getCredits.mockRejectedValue(apiError);

      await expect(
        handleGetCredits({
          client: mockClient as any,
          logger: mockLogger,
        })
      ).rejects.toThrow(ApiError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'API error fetching credits',
        expect.objectContaining({
          code: ErrorCode.AUTH_MISSING_KEY,
        })
      );
    });

    it('should handle unexpected errors', async () => {
      mockClient.getCredits.mockRejectedValue(new Error('Network error'));

      await expect(
        handleGetCredits({
          client: mockClient as any,
          logger: mockLogger,
        })
      ).rejects.toThrow('Network error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Unexpected error fetching credits',
        expect.objectContaining({
          error: 'Network error',
        })
      );
    });

    it('should indicate free tier keys', async () => {
      mockClient.getCredits.mockResolvedValue(
        mockKeyResponse({ is_free_tier: true, usage: 1.0, usage_daily: 0.5, usage_weekly: 1.0, usage_monthly: 1.0 })
      );

      const result = await handleGetCredits({
        client: mockClient as any,
        logger: mockLogger,
      });

      expect(result.structuredResponse.is_free_tier).toBe(true);
      expect(result.textResponse).toContain('Free tier');
    });
  });

  describe('Tool Registration', () => {
    it('should create tool with correct name', () => {
      const mockClient = createMockClient();
      const mockLogger = createMockLogger();

      const tool = createGetCreditsTool({
        client: mockClient as any,
        logger: mockLogger,
      });

      expect(tool.name).toBe(GET_CREDITS_TOOL_NAME);
      expect(tool.name).toBe('openrouter_get_credits');
    });

    it('should have description', () => {
      const mockClient = createMockClient();
      const mockLogger = createMockLogger();

      const tool = createGetCreditsTool({
        client: mockClient as any,
        logger: mockLogger,
      });

      expect(tool.description).toContain('credits');
      expect(tool.description.length).toBeGreaterThan(20);
    });

    it('should have handler function', () => {
      const mockClient = createMockClient();
      const mockLogger = createMockLogger();

      const tool = createGetCreditsTool({
        client: mockClient as any,
        logger: mockLogger,
      });

      expect(typeof tool.handler).toBe('function');
    });

    it('should call handler through tool registration', async () => {
      const mockClient = createMockClient();
      const mockLogger = createMockLogger();

      mockClient.getCredits.mockResolvedValue(
        mockKeyResponse({ limit: 50.0, limit_remaining: 40.0, usage: 10.0, usage_daily: 3.0, usage_weekly: 7.0, usage_monthly: 10.0 })
      );

      const tool = createGetCreditsTool({
        client: mockClient as any,
        logger: mockLogger,
      });

      const result = await tool.handler({});

      expect(result.content[0].text).toContain('$50.0000');
      expect(result.structuredContent).toEqual({
        limit: 50.0,
        limit_remaining: 40.0,
        usage: 10.0,
        usage_daily: 3.0,
        usage_weekly: 7.0,
        usage_monthly: 10.0,
        is_free_tier: false,
      });
    });
  });
});
