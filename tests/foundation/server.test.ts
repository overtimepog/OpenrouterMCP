/**
 * Foundation Tests for OpenRouter MCP Server
 * Tests: Server lifecycle, transport, environment validation, and tool registration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenRouterServer } from '../../src/server/OpenRouterServer.js';
import { Logger } from '../../src/utils/logger.js';

// Mock the MCP SDK modules
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: { method: 'tools/call' },
  ListToolsRequestSchema: { method: 'tools/list' },
}));

// Create a silent logger for tests
const createTestLogger = (): Logger => {
  return new Logger({ level: 'error', name: 'test' });
};

describe('OpenRouterServer', () => {
  const validApiKey = 'sk-or-v1-test-api-key-12345';

  describe('Server Instantiation and Lifecycle', () => {
    it('should create a server instance with valid configuration', () => {
      const server = new OpenRouterServer({
        apiKey: validApiKey,
        logger: createTestLogger(),
      });

      expect(server).toBeDefined();
      expect(server).toBeInstanceOf(OpenRouterServer);
      expect(server.isServerRunning()).toBe(false);
    });

    it('should start and stop the server correctly', async () => {
      const server = new OpenRouterServer({
        apiKey: validApiKey,
        logger: createTestLogger(),
      });

      // Server should not be running initially
      expect(server.isServerRunning()).toBe(false);

      // Start the server
      await server.start();
      expect(server.isServerRunning()).toBe(true);

      // Stop the server
      await server.stop();
      expect(server.isServerRunning()).toBe(false);
    });

    it('should handle multiple start calls gracefully', async () => {
      const server = new OpenRouterServer({
        apiKey: validApiKey,
        logger: createTestLogger(),
      });

      await server.start();
      expect(server.isServerRunning()).toBe(true);

      // Second start should not throw
      await expect(server.start()).resolves.not.toThrow();
      expect(server.isServerRunning()).toBe(true);

      await server.stop();
    });

    it('should handle stop when not running gracefully', async () => {
      const server = new OpenRouterServer({
        apiKey: validApiKey,
        logger: createTestLogger(),
      });

      // Stop without starting should not throw
      await expect(server.stop()).resolves.not.toThrow();
      expect(server.isServerRunning()).toBe(false);
    });
  });

  describe('Environment Variable Loading (via config)', () => {
    it('should store and retrieve API key from configuration', () => {
      const server = new OpenRouterServer({
        apiKey: validApiKey,
        logger: createTestLogger(),
      });

      expect(server.getApiKey()).toBe(validApiKey);
    });

    it('should handle API key with different formats', () => {
      const apiKeyFormats = [
        'sk-or-v1-abcdef123456',
        'sk-test-key-with-dashes',
        'simple_api_key_underscores',
      ];

      for (const apiKey of apiKeyFormats) {
        const server = new OpenRouterServer({
          apiKey,
          logger: createTestLogger(),
        });
        expect(server.getApiKey()).toBe(apiKey);
      }
    });
  });

  describe('Tool Registration Mechanism', () => {
    it('should register a tool successfully', () => {
      const server = new OpenRouterServer({
        apiKey: validApiKey,
        logger: createTestLogger(),
      });

      const { z } = require('zod');

      server.registerTool({
        name: 'test_tool',
        description: 'A test tool for validation',
        inputSchema: z.object({
          message: z.string(),
        }),
        handler: async () => ({
          content: [{ type: 'text' as const, text: 'Test response' }],
        }),
      });

      const registeredTools = server.getRegisteredTools();
      expect(registeredTools).toContain('test_tool');
    });

    it('should register multiple tools', () => {
      const server = new OpenRouterServer({
        apiKey: validApiKey,
        logger: createTestLogger(),
      });

      const { z } = require('zod');

      const tools = ['tool_one', 'tool_two', 'tool_three'];

      for (const toolName of tools) {
        server.registerTool({
          name: toolName,
          description: `Description for ${toolName}`,
          inputSchema: z.object({}),
          handler: async () => ({
            content: [{ type: 'text' as const, text: 'Response' }],
          }),
        });
      }

      const registeredTools = server.getRegisteredTools();
      expect(registeredTools).toHaveLength(3);
      expect(registeredTools).toEqual(expect.arrayContaining(tools));
    });

    it('should allow overwriting existing tool registration', () => {
      const server = new OpenRouterServer({
        apiKey: validApiKey,
        logger: createTestLogger(),
      });

      const { z } = require('zod');

      // Register initial tool
      server.registerTool({
        name: 'overwrite_test',
        description: 'Original description',
        inputSchema: z.object({}),
        handler: async () => ({
          content: [{ type: 'text' as const, text: 'Original' }],
        }),
      });

      // Overwrite with new registration
      server.registerTool({
        name: 'overwrite_test',
        description: 'New description',
        inputSchema: z.object({ newField: z.string() }),
        handler: async () => ({
          content: [{ type: 'text' as const, text: 'New' }],
        }),
      });

      // Should still have only one tool with this name
      const registeredTools = server.getRegisteredTools();
      expect(registeredTools.filter((t) => t === 'overwrite_test')).toHaveLength(1);
    });
  });

  describe('Stdio Transport Initialization', () => {
    it('should initialize transport when starting server', async () => {
      const { StdioServerTransport } = await import(
        '@modelcontextprotocol/sdk/server/stdio.js'
      );

      const server = new OpenRouterServer({
        apiKey: validApiKey,
        logger: createTestLogger(),
      });

      await server.start();

      // Verify transport was created
      expect(StdioServerTransport).toHaveBeenCalled();

      await server.stop();
    });
  });
});

describe('Environment Validation Function', () => {
  const originalEnv = process.env;
  let mockExit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Mock process.exit before any imports
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as () => never);
  });

  afterEach(() => {
    process.env = originalEnv;
    mockExit.mockRestore();
    vi.resetModules();
  });

  it('should return API key when OPENROUTER_API_KEY is valid', async () => {
    process.env['OPENROUTER_API_KEY'] = 'sk-or-v1-valid-key-123456';

    const { validateEnvironment } = await import('../../src/index.js');

    const result = validateEnvironment();
    expect(result.apiKey).toBe('sk-or-v1-valid-key-123456');
  });

  it('should call process.exit when OPENROUTER_API_KEY is missing', async () => {
    delete process.env['OPENROUTER_API_KEY'];

    const { validateEnvironment } = await import('../../src/index.js');

    expect(() => validateEnvironment()).toThrow('process.exit called');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should call process.exit when OPENROUTER_API_KEY is too short', async () => {
    process.env['OPENROUTER_API_KEY'] = 'short';

    const { validateEnvironment } = await import('../../src/index.js');

    expect(() => validateEnvironment()).toThrow('process.exit called');
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
