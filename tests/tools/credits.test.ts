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

    it('should fetch and format credits successfully', async () => {
      mockClient.getCredits.mockResolvedValue({
        data: {
          data: {
            total_credits: 100.0,
            total_usage: 25.5,
          },
        },
      });

      const result = await handleGetCredits({
        client: mockClient as any,
        logger: mockLogger,
      });

      expect(result.structuredResponse).toEqual({
        total_credits: 100.0,
        total_usage: 25.5,
        available_balance: 74.5,
        usage_percentage: 25.5,
      });

      expect(result.textResponse).toContain('$100.0000');
      expect(result.textResponse).toContain('$25.5000');
      expect(result.textResponse).toContain('$74.5000');
    });

    it('should calculate usage percentage correctly', async () => {
      mockClient.getCredits.mockResolvedValue({
        data: {
          data: {
            total_credits: 200.0,
            total_usage: 50.0,
          },
        },
      });

      const result = await handleGetCredits({
        client: mockClient as any,
        logger: mockLogger,
      });

      expect(result.structuredResponse.usage_percentage).toBe(25);
    });

    it('should handle zero credits gracefully', async () => {
      mockClient.getCredits.mockResolvedValue({
        data: {
          data: {
            total_credits: 0,
            total_usage: 0,
          },
        },
      });

      const result = await handleGetCredits({
        client: mockClient as any,
        logger: mockLogger,
      });

      expect(result.structuredResponse.available_balance).toBe(0);
      expect(result.structuredResponse.usage_percentage).toBe(0);
    });

    it('should show low balance warning', async () => {
      mockClient.getCredits.mockResolvedValue({
        data: {
          data: {
            total_credits: 10.0,
            total_usage: 9.5,
          },
        },
      });

      const result = await handleGetCredits({
        client: mockClient as any,
        logger: mockLogger,
      });

      expect(result.structuredResponse.available_balance).toBe(0.5);
      expect(result.textResponse).toContain('Warning');
      expect(result.textResponse).toContain('Low balance');
    });

    it('should log info on success', async () => {
      mockClient.getCredits.mockResolvedValue({
        data: {
          data: {
            total_credits: 100.0,
            total_usage: 20.0,
          },
        },
      });

      await handleGetCredits({
        client: mockClient as any,
        logger: mockLogger,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Credits fetched',
        expect.objectContaining({
          available: 80.0,
          usage: 20.0,
        })
      );
    });

    it('should handle API errors', async () => {
      const apiError = new ApiError('Auth failed', ErrorCode.AUTH_ERROR, 401);
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
          code: ErrorCode.AUTH_ERROR,
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

      mockClient.getCredits.mockResolvedValue({
        data: {
          data: {
            total_credits: 50.0,
            total_usage: 10.0,
          },
        },
      });

      const tool = createGetCreditsTool({
        client: mockClient as any,
        logger: mockLogger,
      });

      const result = await tool.handler({});

      expect(result.content[0].text).toContain('$50.0000');
      expect(result.structuredContent).toEqual({
        total_credits: 50.0,
        total_usage: 10.0,
        available_balance: 40.0,
        usage_percentage: 20.0,
      });
    });
  });
});
