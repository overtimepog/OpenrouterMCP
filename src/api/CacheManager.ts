/**
 * Cache Manager for OpenRouter API client.
 * Provides memory-based caching for model list and other responses.
 */

import { Logger, logger as defaultLogger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

export interface CacheManagerConfig {
  defaultTtlMs?: number;
  maxEntries?: number;
  logger?: Logger;
}

// ============================================================================
// Cache Manager Implementation
// ============================================================================

export class CacheManager {
  private readonly logger: Logger;
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;

  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private hits = 0;
  private misses = 0;

  // Predefined cache keys
  static readonly KEYS = {
    MODEL_LIST: 'models:list',
  } as const;

  // Default TTLs
  static readonly TTL = {
    MODEL_LIST: 5 * 60 * 1000, // 5 minutes
    SHORT: 60 * 1000, // 1 minute
    LONG: 30 * 60 * 1000, // 30 minutes
  } as const;

  constructor(config: CacheManagerConfig = {}) {
    this.logger = config.logger ?? defaultLogger.child('cache');
    this.defaultTtlMs = config.defaultTtlMs ?? CacheManager.TTL.MODEL_LIST;
    this.maxEntries = config.maxEntries ?? 100;
  }

  // ============================================================================
  // Core Cache Operations
  // ============================================================================

  /**
   * Get a value from the cache.
   * Returns undefined if not found or expired.
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      this.logger.debug('Cache miss', { key });
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      this.logger.debug('Cache entry expired', { key });
      return undefined;
    }

    this.hits++;
    this.logger.debug('Cache hit', { key });
    return entry.data as T;
  }

  /**
   * Set a value in the cache with optional TTL.
   */
  set<T>(key: string, data: T, ttlMs?: number): void {
    // Enforce max entries limit
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      this.evictOldest();
    }

    const now = Date.now();
    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      expiresAt: now + (ttlMs ?? this.defaultTtlMs),
    };

    this.cache.set(key, entry);
    this.logger.debug('Cache set', { key, ttlMs: ttlMs ?? this.defaultTtlMs });
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a specific key from the cache.
   */
  delete(key: string): boolean {
    const existed = this.cache.delete(key);
    if (existed) {
      this.logger.debug('Cache entry deleted', { key });
    }
    return existed;
  }

  /**
   * Invalidate a specific cache entry.
   * Alias for delete() for semantic clarity.
   */
  invalidate(key: string): boolean {
    return this.delete(key);
  }

  /**
   * Invalidate all entries matching a prefix.
   */
  invalidateByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      this.logger.debug('Cache entries invalidated by prefix', { prefix, count });
    }

    return count;
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.logger.debug('Cache cleared', { entriesRemoved: size });
  }

  // ============================================================================
  // Cache-aside Pattern Helper
  // ============================================================================

  /**
   * Get a value from cache, or fetch it using the provided function if not cached.
   * This implements the cache-aside pattern.
   */
  async getOrFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    // Fetch fresh data
    this.logger.debug('Fetching data for cache', { key });
    const data = await fetchFn();

    // Cache the result
    this.set(key, data, ttlMs);

    return data;
  }

  // ============================================================================
  // Maintenance
  // ============================================================================

  /**
   * Remove expired entries from the cache.
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.debug('Cache cleanup completed', { entriesRemoved: removed });
    }

    return removed;
  }

  /**
   * Evict the oldest entry to make room for new ones.
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.logger.debug('Cache evicted oldest entry', { key: oldestKey });
    }
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Reset cache statistics.
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get the remaining TTL for a cache entry in milliseconds.
   */
  getTtl(key: string): number | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    const remaining = entry.expiresAt - Date.now();
    return remaining > 0 ? remaining : 0;
  }
}

export default CacheManager;
