/**
 * Tests for CostTracker.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CostTracker, CostEntry, RequestUsage } from '../../src/cost/CostTracker.js';

// Mock logger
const createMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
});

describe('CostTracker', () => {
  describe('Basic Operations', () => {
    it('should create instance with default config', () => {
      const tracker = new CostTracker();
      expect(tracker.getEntryCount()).toBe(0);
    });

    it('should create instance with custom max entries', () => {
      const tracker = new CostTracker({ maxEntries: 100 });
      expect(tracker.getEntryCount()).toBe(0);
    });

    it('should create instance with logger', () => {
      const logger = createMockLogger();
      const tracker = new CostTracker({ logger });
      expect(tracker.getEntryCount()).toBe(0);
    });
  });

  describe('Recording Costs', () => {
    let tracker: CostTracker;
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
      mockLogger = createMockLogger();
      tracker = new CostTracker({ logger: mockLogger });
    });

    it('should record a cost entry', () => {
      const usage: RequestUsage = {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        cost: 0.001,
      };

      const entry = tracker.recordCost({
        model: 'openai/gpt-4',
        operation: 'chat',
        usage,
      });

      expect(entry.id).toMatch(/^cost-/);
      expect(entry.model).toBe('openai/gpt-4');
      expect(entry.operation).toBe('chat');
      expect(entry.usage).toEqual(usage);
      expect(entry.cached).toBe(false);
      expect(tracker.getEntryCount()).toBe(1);
    });

    it('should record entry with session ID', () => {
      const entry = tracker.recordCost({
        sessionId: 'session-123',
        model: 'openai/gpt-4',
        operation: 'chat',
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      });

      expect(entry.sessionId).toBe('session-123');
    });

    it('should record entry as cached', () => {
      const entry = tracker.recordCost({
        model: 'openai/gpt-4',
        operation: 'chat',
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
        cached: true,
      });

      expect(entry.cached).toBe(true);
    });

    it('should record image generation costs', () => {
      const entry = tracker.recordCost({
        model: 'google/gemini-2.5-flash-image-preview',
        operation: 'image',
        usage: {
          prompt_tokens: 50,
          completion_tokens: 0,
          total_tokens: 50,
          cost: 0.05,
        },
      });

      expect(entry.operation).toBe('image');
    });

    it('should log debug message when recording cost', () => {
      tracker.recordCost({
        model: 'openai/gpt-4',
        operation: 'chat',
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          cost: 0.001,
        },
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Cost recorded',
        expect.objectContaining({
          model: 'openai/gpt-4',
          operation: 'chat',
          cost: 0.001,
          tokens: 150,
        })
      );
    });

    it('should generate unique entry IDs', () => {
      const entry1 = tracker.recordCost({
        model: 'openai/gpt-4',
        operation: 'chat',
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });

      const entry2 = tracker.recordCost({
        model: 'openai/gpt-4',
        operation: 'chat',
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });

      expect(entry1.id).not.toBe(entry2.id);
    });
  });

  describe('Entry Limits', () => {
    it('should trim old entries when exceeding max', () => {
      const logger = createMockLogger();
      const tracker = new CostTracker({ maxEntries: 5, logger });

      for (let i = 0; i < 10; i++) {
        tracker.recordCost({
          model: `model-${i}`,
          operation: 'chat',
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        });
      }

      expect(tracker.getEntryCount()).toBe(5);
      expect(logger.debug).toHaveBeenCalledWith(
        'Trimmed old cost entries',
        expect.objectContaining({ removed: expect.any(Number) })
      );
    });

    it('should keep the most recent entries when trimming', () => {
      const tracker = new CostTracker({ maxEntries: 3 });

      for (let i = 0; i < 5; i++) {
        tracker.recordCost({
          model: `model-${i}`,
          operation: 'chat',
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        });
      }

      const entries = tracker.exportEntries();
      expect(entries.map(e => e.model)).toEqual(['model-2', 'model-3', 'model-4']);
    });
  });

  describe('Cost Summaries', () => {
    let tracker: CostTracker;

    beforeEach(() => {
      tracker = new CostTracker();

      // Add some test entries
      tracker.recordCost({
        sessionId: 'session-1',
        model: 'openai/gpt-4',
        operation: 'chat',
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost: 0.01 },
      });

      tracker.recordCost({
        sessionId: 'session-1',
        model: 'openai/gpt-4',
        operation: 'chat',
        usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300, cost: 0.02 },
      });

      tracker.recordCost({
        sessionId: 'session-2',
        model: 'anthropic/claude-3-opus',
        operation: 'chat',
        usage: { prompt_tokens: 500, completion_tokens: 200, total_tokens: 700, cost: 0.05 },
      });

      tracker.recordCost({
        sessionId: 'session-1',
        model: 'google/gemini-2.5-flash-image-preview',
        operation: 'image',
        usage: { prompt_tokens: 50, completion_tokens: 0, total_tokens: 50, cost: 0.10 },
      });
    });

    describe('getTotalCosts', () => {
      it('should return total summary for all entries', () => {
        const summary = tracker.getTotalCosts();

        expect(summary.requestCount).toBe(4);
        expect(summary.totalCost).toBeCloseTo(0.18);
        expect(summary.totalPromptTokens).toBe(850);
        expect(summary.totalCompletionTokens).toBe(350);
        expect(summary.totalTokens).toBe(1200);
      });

      it('should break down by model', () => {
        const summary = tracker.getTotalCosts();

        expect(Object.keys(summary.byModel)).toHaveLength(3);
        expect(summary.byModel['openai/gpt-4'].cost).toBeCloseTo(0.03);
        expect(summary.byModel['openai/gpt-4'].requestCount).toBe(2);
        expect(summary.byModel['anthropic/claude-3-opus'].cost).toBeCloseTo(0.05);
        expect(summary.byModel['google/gemini-2.5-flash-image-preview'].cost).toBeCloseTo(0.10);
      });

      it('should break down by operation', () => {
        const summary = tracker.getTotalCosts();

        expect(Object.keys(summary.byOperation)).toHaveLength(2);
        expect(summary.byOperation['chat'].requestCount).toBe(3);
        expect(summary.byOperation['image'].requestCount).toBe(1);
      });

      it('should include time range', () => {
        const summary = tracker.getTotalCosts();

        expect(summary.timeRange.start).toBeDefined();
        expect(summary.timeRange.end).toBeDefined();
        expect(summary.timeRange.start instanceof Date).toBe(true);
        expect(summary.timeRange.end instanceof Date).toBe(true);
      });
    });

    describe('getSessionCosts', () => {
      it('should return summary for specific session', () => {
        const summary = tracker.getSessionCosts('session-1');

        expect(summary.requestCount).toBe(3);
        expect(summary.totalCost).toBeCloseTo(0.13);
      });

      it('should return empty summary for unknown session', () => {
        const summary = tracker.getSessionCosts('unknown-session');

        expect(summary.requestCount).toBe(0);
        expect(summary.totalCost).toBe(0);
        expect(summary.timeRange.start).toBeNull();
        expect(summary.timeRange.end).toBeNull();
      });

      it('should correctly filter by session', () => {
        const summary1 = tracker.getSessionCosts('session-1');
        const summary2 = tracker.getSessionCosts('session-2');

        expect(summary1.requestCount).toBe(3);
        expect(summary2.requestCount).toBe(1);
        expect(summary1.totalCost + summary2.totalCost).toBeCloseTo(0.18);
      });
    });

    describe('getCostsByModel', () => {
      it('should return summary for specific model', () => {
        const summary = tracker.getCostsByModel('openai/gpt-4');

        expect(summary.requestCount).toBe(2);
        expect(summary.totalCost).toBeCloseTo(0.03);
        expect(summary.totalTokens).toBe(450);
      });

      it('should return empty summary for unknown model', () => {
        const summary = tracker.getCostsByModel('unknown/model');

        expect(summary.requestCount).toBe(0);
        expect(summary.totalCost).toBe(0);
      });
    });

    describe('getCostsByTimeRange', () => {
      it('should filter by time range', () => {
        const now = new Date();
        const past = new Date(now.getTime() - 1000);
        const future = new Date(now.getTime() + 1000);

        const summary = tracker.getCostsByTimeRange(past, future);

        expect(summary.requestCount).toBe(4);
      });

      it('should return empty for out-of-range times', () => {
        const farPast = new Date(0);
        const stilPast = new Date(1);

        const summary = tracker.getCostsByTimeRange(farPast, stilPast);

        expect(summary.requestCount).toBe(0);
      });
    });
  });

  describe('Entry Management', () => {
    let tracker: CostTracker;
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
      mockLogger = createMockLogger();
      tracker = new CostTracker({ logger: mockLogger });
    });

    describe('getRecentEntries', () => {
      it('should return recent entries', () => {
        for (let i = 0; i < 10; i++) {
          tracker.recordCost({
            model: `model-${i}`,
            operation: 'chat',
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
          });
        }

        const recent = tracker.getRecentEntries(5);
        expect(recent).toHaveLength(5);
        expect(recent[0].model).toBe('model-5');
        expect(recent[4].model).toBe('model-9');
      });

      it('should return all entries if less than limit', () => {
        tracker.recordCost({
          model: 'test-model',
          operation: 'chat',
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        });

        const recent = tracker.getRecentEntries(100);
        expect(recent).toHaveLength(1);
      });
    });

    describe('clear', () => {
      it('should clear all entries', () => {
        tracker.recordCost({
          model: 'test-model',
          operation: 'chat',
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        });
        tracker.recordCost({
          model: 'test-model-2',
          operation: 'chat',
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        });

        expect(tracker.getEntryCount()).toBe(2);

        tracker.clear();

        expect(tracker.getEntryCount()).toBe(0);
        expect(mockLogger.info).toHaveBeenCalledWith('Cost entries cleared', { count: 2 });
      });
    });

    describe('clearSession', () => {
      it('should clear entries for specific session', () => {
        tracker.recordCost({
          sessionId: 'session-1',
          model: 'test-model',
          operation: 'chat',
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        });
        tracker.recordCost({
          sessionId: 'session-2',
          model: 'test-model',
          operation: 'chat',
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        });

        const removed = tracker.clearSession('session-1');

        expect(removed).toBe(1);
        expect(tracker.getEntryCount()).toBe(1);
      });

      it('should return 0 for unknown session', () => {
        const removed = tracker.clearSession('unknown-session');
        expect(removed).toBe(0);
      });
    });

    describe('exportEntries', () => {
      it('should export all entries', () => {
        tracker.recordCost({
          model: 'test-model',
          operation: 'chat',
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        });

        const entries = tracker.exportEntries();
        expect(entries).toHaveLength(1);
        expect(entries[0].model).toBe('test-model');
      });

      it('should return a copy of entries', () => {
        tracker.recordCost({
          model: 'test-model',
          operation: 'chat',
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        });

        const entries1 = tracker.exportEntries();
        const entries2 = tracker.exportEntries();

        expect(entries1).not.toBe(entries2);
        expect(entries1).toEqual(entries2);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero cost entries', () => {
      const tracker = new CostTracker();

      tracker.recordCost({
        model: 'test-model',
        operation: 'chat',
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost: 0 },
      });

      const summary = tracker.getTotalCosts();
      expect(summary.totalCost).toBe(0);
      expect(summary.totalTokens).toBe(0);
    });

    it('should handle missing cost field', () => {
      const tracker = new CostTracker();

      tracker.recordCost({
        model: 'test-model',
        operation: 'chat',
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

      const summary = tracker.getTotalCosts();
      expect(summary.totalCost).toBe(0);
      expect(summary.totalTokens).toBe(150);
    });

    it('should handle very large numbers', () => {
      const tracker = new CostTracker();

      tracker.recordCost({
        model: 'test-model',
        operation: 'chat',
        usage: {
          prompt_tokens: 1000000,
          completion_tokens: 500000,
          total_tokens: 1500000,
          cost: 100.50,
        },
      });

      const summary = tracker.getTotalCosts();
      expect(summary.totalCost).toBeCloseTo(100.50);
      expect(summary.totalTokens).toBe(1500000);
    });
  });
});
