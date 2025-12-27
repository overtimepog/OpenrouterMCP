/**
 * Tests for the Get Cost Summary Tool.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetCostSummaryInputSchema } from '../../src/tools/costSummary/schema.js';
import { handleGetCostSummary } from '../../src/tools/costSummary/handler.js';
import { createGetCostSummaryTool, GET_COST_SUMMARY_TOOL_NAME } from '../../src/tools/costSummary/index.js';
import { CostTracker } from '../../src/cost/CostTracker.js';

// Mock logger
const createMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
});

describe('Get Cost Summary Tool', () => {
  describe('Input Schema Validation', () => {
    it('should accept empty input for total costs', () => {
      const result = GetCostSummaryInputSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept session_id', () => {
      const result = GetCostSummaryInputSchema.safeParse({
        session_id: 'session-123',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.session_id).toBe('session-123');
      }
    });

    it('should accept recent_only flag', () => {
      const result = GetCostSummaryInputSchema.safeParse({
        recent_only: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.recent_only).toBe(true);
      }
    });

    it('should accept both parameters', () => {
      const result = GetCostSummaryInputSchema.safeParse({
        session_id: 'session-123',
        recent_only: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Handler', () => {
    let costTracker: CostTracker;
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
      costTracker = new CostTracker();
      mockLogger = createMockLogger();

      // Add test data
      costTracker.recordCost({
        sessionId: 'session-1',
        model: 'openai/gpt-4',
        operation: 'chat',
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost: 0.01 },
      });

      costTracker.recordCost({
        sessionId: 'session-1',
        model: 'google/gemini-2.5-flash-image-preview',
        operation: 'image',
        usage: { prompt_tokens: 50, completion_tokens: 0, total_tokens: 50, cost: 0.05 },
      });

      costTracker.recordCost({
        sessionId: 'session-2',
        model: 'anthropic/claude-3-opus',
        operation: 'chat',
        usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300, cost: 0.03 },
      });
    });

    describe('Total Costs', () => {
      it('should return total costs when no session specified', async () => {
        const result = await handleGetCostSummary(
          {},
          { costTracker, logger: mockLogger }
        );

        expect(result.structuredResponse.scope).toBe('total');
        expect(result.structuredResponse.request_count).toBe(3);
        expect(result.structuredResponse.total_cost).toBeCloseTo(0.09);
      });

      it('should include all token stats', async () => {
        const result = await handleGetCostSummary(
          {},
          { costTracker, logger: mockLogger }
        );

        expect(result.structuredResponse.total_prompt_tokens).toBe(350);
        expect(result.structuredResponse.total_completion_tokens).toBe(150);
        expect(result.structuredResponse.total_tokens).toBe(500);
      });

      it('should break down by model', async () => {
        const result = await handleGetCostSummary(
          {},
          { costTracker, logger: mockLogger }
        );

        expect(result.structuredResponse.by_model).toHaveLength(3);

        const gpt4 = result.structuredResponse.by_model.find(m => m.model === 'openai/gpt-4');
        expect(gpt4).toBeDefined();
        expect(gpt4?.cost).toBeCloseTo(0.01);
        expect(gpt4?.requestCount).toBe(1);
      });

      it('should break down by operation', async () => {
        const result = await handleGetCostSummary(
          {},
          { costTracker, logger: mockLogger }
        );

        expect(result.structuredResponse.by_operation).toHaveLength(2);

        const chat = result.structuredResponse.by_operation.find(o => o.operation === 'chat');
        expect(chat).toBeDefined();
        expect(chat?.requestCount).toBe(2);

        const image = result.structuredResponse.by_operation.find(o => o.operation === 'image');
        expect(image).toBeDefined();
        expect(image?.requestCount).toBe(1);
      });

      it('should include time range', async () => {
        const result = await handleGetCostSummary(
          {},
          { costTracker, logger: mockLogger }
        );

        expect(result.structuredResponse.time_range.start).not.toBeNull();
        expect(result.structuredResponse.time_range.end).not.toBeNull();
      });
    });

    describe('Session Costs', () => {
      it('should return costs for specific session', async () => {
        const result = await handleGetCostSummary(
          { session_id: 'session-1' },
          { costTracker, logger: mockLogger }
        );

        expect(result.structuredResponse.scope).toBe('session');
        expect(result.structuredResponse.session_id).toBe('session-1');
        expect(result.structuredResponse.request_count).toBe(2);
        expect(result.structuredResponse.total_cost).toBeCloseTo(0.06);
      });

      it('should return empty for unknown session', async () => {
        const result = await handleGetCostSummary(
          { session_id: 'unknown-session' },
          { costTracker, logger: mockLogger }
        );

        expect(result.structuredResponse.request_count).toBe(0);
        expect(result.structuredResponse.total_cost).toBe(0);
      });
    });

    describe('Text Response Formatting', () => {
      it('should format total summary heading', async () => {
        const result = await handleGetCostSummary(
          {},
          { costTracker, logger: mockLogger }
        );

        expect(result.textResponse).toContain('Cost Summary');
        expect(result.textResponse).toContain('Total (All Sessions)');
      });

      it('should format session summary heading', async () => {
        const result = await handleGetCostSummary(
          { session_id: 'session-1' },
          { costTracker, logger: mockLogger }
        );

        expect(result.textResponse).toContain('Session session-1');
      });

      it('should include cost in dollars', async () => {
        const result = await handleGetCostSummary(
          {},
          { costTracker, logger: mockLogger }
        );

        expect(result.textResponse).toContain('$');
        expect(result.textResponse).toContain('Total Cost');
      });

      it('should include token counts', async () => {
        const result = await handleGetCostSummary(
          {},
          { costTracker, logger: mockLogger }
        );

        expect(result.textResponse).toContain('Total Tokens');
        expect(result.textResponse).toContain('Prompt');
        expect(result.textResponse).toContain('Completion');
      });

      it('should include model breakdown', async () => {
        const result = await handleGetCostSummary(
          {},
          { costTracker, logger: mockLogger }
        );

        expect(result.textResponse).toContain('Cost by Model');
        expect(result.textResponse).toContain('openai/gpt-4');
      });

      it('should include operation breakdown', async () => {
        const result = await handleGetCostSummary(
          {},
          { costTracker, logger: mockLogger }
        );

        expect(result.textResponse).toContain('Cost by Operation');
        expect(result.textResponse).toContain('chat');
        expect(result.textResponse).toContain('image');
      });

      it('should show message when no data', async () => {
        const emptyTracker = new CostTracker();

        const result = await handleGetCostSummary(
          {},
          { costTracker: emptyTracker, logger: mockLogger }
        );

        expect(result.textResponse).toContain('No cost data recorded');
      });
    });

    describe('Logging', () => {
      it('should log debug on request', async () => {
        await handleGetCostSummary(
          { session_id: 'session-1' },
          { costTracker, logger: mockLogger }
        );

        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Fetching cost summary',
          expect.objectContaining({
            sessionId: 'session-1',
          })
        );
      });

      it('should log info on success', async () => {
        await handleGetCostSummary(
          {},
          { costTracker, logger: mockLogger }
        );

        expect(mockLogger.info).toHaveBeenCalledWith(
          'Cost summary retrieved',
          expect.objectContaining({
            scope: 'total',
            requestCount: 3,
          })
        );
      });
    });
  });

  describe('Tool Registration', () => {
    let costTracker: CostTracker;
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
      costTracker = new CostTracker();
      mockLogger = createMockLogger();
    });

    it('should create tool with correct name', () => {
      const tool = createGetCostSummaryTool({
        costTracker,
        logger: mockLogger,
      });

      expect(tool.name).toBe(GET_COST_SUMMARY_TOOL_NAME);
      expect(tool.name).toBe('openrouter_get_cost_summary');
    });

    it('should have description', () => {
      const tool = createGetCostSummaryTool({
        costTracker,
        logger: mockLogger,
      });

      expect(tool.description).toContain('cost');
      expect(tool.description).toContain('summary');
      expect(tool.description.length).toBeGreaterThan(50);
    });

    it('should have input schema', () => {
      const tool = createGetCostSummaryTool({
        costTracker,
        logger: mockLogger,
      });

      expect(tool.inputSchema).toBeDefined();
    });

    it('should call handler through tool registration', async () => {
      costTracker.recordCost({
        model: 'test-model',
        operation: 'chat',
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost: 0.01 },
      });

      const tool = createGetCostSummaryTool({
        costTracker,
        logger: mockLogger,
      });

      const result = await tool.handler({});

      expect(result.content[0].text).toContain('Cost Summary');
      expect(result.structuredContent).toHaveProperty('total_cost');
    });
  });

  describe('Integration Scenarios', () => {
    it('should correctly report costs for image generation session', async () => {
      const costTracker = new CostTracker();
      const mockLogger = createMockLogger();

      // Simulate multiple image generations in a session
      costTracker.recordCost({
        sessionId: 'image-session',
        model: 'google/gemini-2.5-flash-image-preview',
        operation: 'image',
        usage: { prompt_tokens: 50, completion_tokens: 0, total_tokens: 50, cost: 0.05 },
      });

      costTracker.recordCost({
        sessionId: 'image-session',
        model: 'google/gemini-2.5-flash-image-preview',
        operation: 'image',
        usage: { prompt_tokens: 75, completion_tokens: 0, total_tokens: 75, cost: 0.08 },
      });

      costTracker.recordCost({
        sessionId: 'image-session',
        model: 'google/gemini-2.5-flash-image-preview',
        operation: 'image',
        usage: { prompt_tokens: 60, completion_tokens: 0, total_tokens: 60, cost: 0.06 },
      });

      const result = await handleGetCostSummary(
        { session_id: 'image-session' },
        { costTracker, logger: mockLogger }
      );

      expect(result.structuredResponse.request_count).toBe(3);
      expect(result.structuredResponse.total_cost).toBeCloseTo(0.19);
      expect(result.structuredResponse.by_operation).toHaveLength(1);
      expect(result.structuredResponse.by_operation[0].operation).toBe('image');
      expect(result.structuredResponse.by_operation[0].requestCount).toBe(3);
      expect(result.textResponse).toContain('image');
      expect(result.textResponse).toContain('3 requests');
    });

    it('should correctly report mixed operation costs', async () => {
      const costTracker = new CostTracker();
      const mockLogger = createMockLogger();

      // Simulate a mixed session with chat and images
      costTracker.recordCost({
        sessionId: 'mixed-session',
        model: 'openai/gpt-4',
        operation: 'chat',
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost: 0.01 },
      });

      costTracker.recordCost({
        sessionId: 'mixed-session',
        model: 'google/gemini-2.5-flash-image-preview',
        operation: 'image',
        usage: { prompt_tokens: 50, completion_tokens: 0, total_tokens: 50, cost: 0.05 },
      });

      costTracker.recordCost({
        sessionId: 'mixed-session',
        model: 'openai/gpt-4',
        operation: 'chat',
        usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300, cost: 0.02 },
      });

      const result = await handleGetCostSummary(
        { session_id: 'mixed-session' },
        { costTracker, logger: mockLogger }
      );

      expect(result.structuredResponse.request_count).toBe(3);
      expect(result.structuredResponse.total_cost).toBeCloseTo(0.08);
      expect(result.structuredResponse.by_operation).toHaveLength(2);

      const chatOp = result.structuredResponse.by_operation.find(o => o.operation === 'chat');
      expect(chatOp?.requestCount).toBe(2);

      const imageOp = result.structuredResponse.by_operation.find(o => o.operation === 'image');
      expect(imageOp?.requestCount).toBe(1);
    });
  });
});
