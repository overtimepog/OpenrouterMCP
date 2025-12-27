/**
 * Cost Tracker for OpenRouter MCP Server.
 * Tracks API costs per session and provides cost summaries.
 */

import { Logger } from '../utils/logger.js';

/**
 * Usage data from a single API request
 */
export interface RequestUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost?: number; // Cost in credits
  cached_tokens?: number;
  reasoning_tokens?: number;
}

/**
 * A single cost entry tracking one API request
 */
export interface CostEntry {
  id: string;
  timestamp: Date;
  sessionId?: string;
  model: string;
  operation: 'chat' | 'image' | 'list_models' | 'search_models';
  usage: RequestUsage;
  cached: boolean;
}

/**
 * Summary of costs for a session or overall
 */
export interface CostSummary {
  totalCost: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  requestCount: number;
  byModel: Record<string, {
    cost: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    requestCount: number;
  }>;
  byOperation: Record<string, {
    cost: number;
    requestCount: number;
  }>;
  timeRange: {
    start: Date | null;
    end: Date | null;
  };
}

/**
 * Configuration for CostTracker
 */
export interface CostTrackerConfig {
  maxEntries?: number; // Maximum entries to keep (default: 10000)
  logger?: Logger;
}

/**
 * CostTracker tracks API usage and costs across all sessions.
 */
export class CostTracker {
  private entries: CostEntry[] = [];
  private readonly maxEntries: number;
  private readonly logger?: Logger;
  private entryIdCounter = 0;

  constructor(config: CostTrackerConfig = {}) {
    this.maxEntries = config.maxEntries ?? 10000;
    this.logger = config.logger;
  }

  /**
   * Generate a unique entry ID.
   */
  private generateEntryId(): string {
    this.entryIdCounter++;
    return `cost-${Date.now()}-${this.entryIdCounter}`;
  }

  /**
   * Record a cost entry from an API request.
   */
  recordCost(params: {
    sessionId?: string;
    model: string;
    operation: CostEntry['operation'];
    usage: RequestUsage;
    cached?: boolean;
  }): CostEntry {
    const entry: CostEntry = {
      id: this.generateEntryId(),
      timestamp: new Date(),
      sessionId: params.sessionId,
      model: params.model,
      operation: params.operation,
      usage: params.usage,
      cached: params.cached ?? false,
    };

    this.entries.push(entry);

    // Trim old entries if exceeding max
    if (this.entries.length > this.maxEntries) {
      const removed = this.entries.splice(0, this.entries.length - this.maxEntries);
      this.logger?.debug('Trimmed old cost entries', { removed: removed.length });
    }

    this.logger?.debug('Cost recorded', {
      entryId: entry.id,
      model: entry.model,
      operation: entry.operation,
      cost: entry.usage.cost,
      tokens: entry.usage.total_tokens,
    });

    return entry;
  }

  /**
   * Get cost summary for a specific session.
   */
  getSessionCosts(sessionId: string): CostSummary {
    const sessionEntries = this.entries.filter(e => e.sessionId === sessionId);
    return this.calculateSummary(sessionEntries);
  }

  /**
   * Get overall cost summary.
   */
  getTotalCosts(): CostSummary {
    return this.calculateSummary(this.entries);
  }

  /**
   * Get cost summary for a time range.
   */
  getCostsByTimeRange(start: Date, end: Date): CostSummary {
    const rangeEntries = this.entries.filter(
      e => e.timestamp >= start && e.timestamp <= end
    );
    return this.calculateSummary(rangeEntries);
  }

  /**
   * Get cost summary by model.
   */
  getCostsByModel(model: string): CostSummary {
    const modelEntries = this.entries.filter(e => e.model === model);
    return this.calculateSummary(modelEntries);
  }

  /**
   * Get recent cost entries.
   */
  getRecentEntries(limit = 50): CostEntry[] {
    return this.entries.slice(-limit);
  }

  /**
   * Clear all cost entries.
   */
  clear(): void {
    const count = this.entries.length;
    this.entries = [];
    this.logger?.info('Cost entries cleared', { count });
  }

  /**
   * Clear cost entries for a specific session.
   */
  clearSession(sessionId: string): number {
    const before = this.entries.length;
    this.entries = this.entries.filter(e => e.sessionId !== sessionId);
    const removed = before - this.entries.length;
    this.logger?.debug('Session cost entries cleared', { sessionId, removed });
    return removed;
  }

  /**
   * Calculate summary from entries.
   */
  private calculateSummary(entries: CostEntry[]): CostSummary {
    const summary: CostSummary = {
      totalCost: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      requestCount: entries.length,
      byModel: {},
      byOperation: {},
      timeRange: {
        start: entries.length > 0 ? entries[0]!.timestamp : null,
        end: entries.length > 0 ? entries[entries.length - 1]!.timestamp : null,
      },
    };

    for (const entry of entries) {
      const cost = entry.usage.cost ?? 0;
      const promptTokens = entry.usage.prompt_tokens;
      const completionTokens = entry.usage.completion_tokens;
      const totalTokens = entry.usage.total_tokens;

      // Totals
      summary.totalCost += cost;
      summary.totalPromptTokens += promptTokens;
      summary.totalCompletionTokens += completionTokens;
      summary.totalTokens += totalTokens;

      // By model
      if (!summary.byModel[entry.model]) {
        summary.byModel[entry.model] = {
          cost: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          requestCount: 0,
        };
      }
      const modelEntry = summary.byModel[entry.model]!;
      modelEntry.cost += cost;
      modelEntry.promptTokens += promptTokens;
      modelEntry.completionTokens += completionTokens;
      modelEntry.totalTokens += totalTokens;
      modelEntry.requestCount++;

      // By operation
      if (!summary.byOperation[entry.operation]) {
        summary.byOperation[entry.operation] = {
          cost: 0,
          requestCount: 0,
        };
      }
      const opEntry = summary.byOperation[entry.operation]!;
      opEntry.cost += cost;
      opEntry.requestCount++;

      // Update time range
      if (!summary.timeRange.start || entry.timestamp < summary.timeRange.start) {
        summary.timeRange.start = entry.timestamp;
      }
      if (!summary.timeRange.end || entry.timestamp > summary.timeRange.end) {
        summary.timeRange.end = entry.timestamp;
      }
    }

    return summary;
  }

  /**
   * Get entry count.
   */
  getEntryCount(): number {
    return this.entries.length;
  }

  /**
   * Export all entries (for debugging/logging).
   */
  exportEntries(): CostEntry[] {
    return [...this.entries];
  }
}

export default CostTracker;
