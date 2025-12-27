/**
 * Logger Tests - Structured JSON logging validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, LogEntry } from '../../src/utils/logger.js';

describe('Logger', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let capturedLogs: string[] = [];

  beforeEach(() => {
    capturedLogs = [];
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((msg: string) => {
      capturedLogs.push(msg);
    });
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((msg: string) => {
      capturedLogs.push(msg);
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('JSON Format Output', () => {
    it('should output valid JSON for all log entries', () => {
      const logger = new Logger({ level: 'debug', name: 'test' });

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      expect(capturedLogs).toHaveLength(4);

      for (const log of capturedLogs) {
        expect(() => JSON.parse(log)).not.toThrow();
      }
    });

    it('should include required fields in log entries', () => {
      const logger = new Logger({ level: 'info', name: 'test' });

      logger.info('Test message');

      expect(capturedLogs).toHaveLength(1);
      const entry: LogEntry = JSON.parse(capturedLogs[0] as string);

      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('level', 'info');
      expect(entry).toHaveProperty('message', 'Test message');
    });

    it('should include timestamp in ISO format', () => {
      const logger = new Logger({ level: 'info', name: 'test' });

      logger.info('Timestamp test');

      const entry: LogEntry = JSON.parse(capturedLogs[0] as string);
      const timestamp = new Date(entry.timestamp);

      expect(timestamp).toBeInstanceOf(Date);
      expect(isNaN(timestamp.getTime())).toBe(false);
    });
  });

  describe('Log Levels', () => {
    it('should support debug level', () => {
      const logger = new Logger({ level: 'debug', name: 'test' });
      logger.debug('Debug test');

      const entry: LogEntry = JSON.parse(capturedLogs[0] as string);
      expect(entry.level).toBe('debug');
    });

    it('should support info level', () => {
      const logger = new Logger({ level: 'info', name: 'test' });
      logger.info('Info test');

      const entry: LogEntry = JSON.parse(capturedLogs[0] as string);
      expect(entry.level).toBe('info');
    });

    it('should support warn level', () => {
      const logger = new Logger({ level: 'warn', name: 'test' });
      logger.warn('Warn test');

      const entry: LogEntry = JSON.parse(capturedLogs[0] as string);
      expect(entry.level).toBe('warn');
    });

    it('should support error level', () => {
      const logger = new Logger({ level: 'error', name: 'test' });
      logger.error('Error test');

      const entry: LogEntry = JSON.parse(capturedLogs[0] as string);
      expect(entry.level).toBe('error');
    });

    it('should filter logs below configured level', () => {
      const logger = new Logger({ level: 'warn', name: 'test' });

      logger.debug('Should not appear');
      logger.info('Should not appear');
      logger.warn('Should appear');
      logger.error('Should appear');

      expect(capturedLogs).toHaveLength(2);
    });
  });

  describe('Context and Metadata', () => {
    it('should include context in log entries', () => {
      const logger = new Logger({ level: 'info', name: 'test' });

      logger.info('With context', { userId: '123', action: 'test' });

      const entry: LogEntry = JSON.parse(capturedLogs[0] as string);
      expect(entry.context).toBeDefined();
      expect(entry.context?.userId).toBe('123');
      expect(entry.context?.action).toBe('test');
    });

    it('should include logger name in context', () => {
      const logger = new Logger({ level: 'info', name: 'my-logger' });

      logger.info('Named logger');

      const entry: LogEntry = JSON.parse(capturedLogs[0] as string);
      expect(entry.context?.logger).toBe('my-logger');
    });

    it('should create child loggers with namespaced names', () => {
      const parent = new Logger({ level: 'info', name: 'parent' });
      const child = parent.child('child');

      child.info('Child message');

      const entry: LogEntry = JSON.parse(capturedLogs[0] as string);
      expect(entry.context?.logger).toBe('parent:child');
    });
  });

  describe('Dynamic Level Changes', () => {
    it('should allow changing log level at runtime', () => {
      const logger = new Logger({ level: 'error', name: 'test' });

      logger.info('Should not appear');
      expect(capturedLogs).toHaveLength(0);

      logger.setLevel('info');
      logger.info('Should appear now');
      expect(capturedLogs).toHaveLength(1);
    });
  });
});
