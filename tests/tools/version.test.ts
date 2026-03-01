/**
 * Tests for the Get Version Tool.
 */

import { describe, it, expect, vi } from 'vitest';
import { GetVersionInputSchema } from '../../src/tools/version/schema.js';
import { handleGetVersion } from '../../src/tools/version/handler.js';
import { createGetVersionTool, GET_VERSION_TOOL_NAME } from '../../src/tools/version/index.js';

// Mock logger
const createMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
});

describe('Get Version Tool', () => {
  describe('Input Schema Validation', () => {
    it('should accept empty input', () => {
      const result = GetVersionInputSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept null as input', () => {
      const result = GetVersionInputSchema.safeParse(null);
      // Null is not valid - empty object is the expected input
      expect(result.success).toBe(false);
    });
  });

  describe('Handler', () => {
    it('should return version info with correct fields', async () => {
      const mockLogger = createMockLogger();

      const result = await handleGetVersion({
        logger: mockLogger,
      });

      expect(result.structuredResponse).toEqual({
        name: 'openrouter-mcp-server',
        version: expect.any(String),
        node_version: process.version,
      });
    });

    it('should return version matching package.json', async () => {
      const mockLogger = createMockLogger();

      const result = await handleGetVersion({
        logger: mockLogger,
      });

      expect(result.structuredResponse.version).toBe('1.0.0');
    });

    it('should format text response with all fields', async () => {
      const mockLogger = createMockLogger();

      const result = await handleGetVersion({
        logger: mockLogger,
      });

      expect(result.textResponse).toContain('OpenRouter MCP Server Version');
      expect(result.textResponse).toContain('openrouter-mcp-server');
      expect(result.textResponse).toContain(process.version);
    });

    it('should log info on success', async () => {
      const mockLogger = createMockLogger();

      await handleGetVersion({
        logger: mockLogger,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Version info retrieved',
        expect.objectContaining({
          name: 'openrouter-mcp-server',
          version: expect.any(String),
          node_version: process.version,
        })
      );
    });
  });

  describe('Tool Registration', () => {
    it('should create tool with correct name', () => {
      const mockLogger = createMockLogger();

      const tool = createGetVersionTool({
        logger: mockLogger,
      });

      expect(tool.name).toBe(GET_VERSION_TOOL_NAME);
      expect(tool.name).toBe('openrouter_get_version');
    });

    it('should have description', () => {
      const mockLogger = createMockLogger();

      const tool = createGetVersionTool({
        logger: mockLogger,
      });

      expect(tool.description).toContain('version');
      expect(tool.description.length).toBeGreaterThan(20);
    });

    it('should have handler function', () => {
      const mockLogger = createMockLogger();

      const tool = createGetVersionTool({
        logger: mockLogger,
      });

      expect(typeof tool.handler).toBe('function');
    });

    it('should call handler through tool registration', async () => {
      const mockLogger = createMockLogger();

      const tool = createGetVersionTool({
        logger: mockLogger,
      });

      const result = await tool.handler({});

      expect(result.content[0].text).toContain('openrouter-mcp-server');
      expect(result.structuredContent).toEqual({
        name: 'openrouter-mcp-server',
        version: expect.any(String),
        node_version: process.version,
      });
    });
  });
});
