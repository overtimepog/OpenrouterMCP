#!/usr/bin/env node

/**
 * OpenRouter MCP Server - Main Entry Point
 *
 * This server provides MCP-compatible access to OpenRouter's unified API,
 * enabling AI assistants to interact with 500+ AI models.
 */

import 'dotenv/config';
import { OpenRouterServer } from './server/OpenRouterServer.js';
import { OpenRouterClient } from './api/OpenRouterClient.js';
import { SessionManager } from './session/SessionManager.js';
import { CostTracker } from './cost/CostTracker.js';
import { createListModelsTool } from './tools/listModels/index.js';
import { createSearchModelsTool } from './tools/searchModels/index.js';
import { createChatTool } from './tools/chat/index.js';
import { createImageGenerationTool } from './tools/imageGeneration/index.js';
import { createGetCreditsTool } from './tools/credits/index.js';
import { createGetCostSummaryTool } from './tools/costSummary/index.js';
import { logger } from './utils/logger.js';

// ============================================================================
// Environment Validation
// ============================================================================

export function validateEnvironment(): { apiKey: string } {
  const apiKey = process.env['OPENROUTER_API_KEY'];

  if (!apiKey) {
    logger.error('Missing required environment variable: OPENROUTER_API_KEY');
    console.error('Error: OPENROUTER_API_KEY environment variable is required');
    console.error('Please set your OpenRouter API key:');
    console.error('  export OPENROUTER_API_KEY=your_api_key_here');
    process.exit(1);
  }

  if (apiKey.length < 10) {
    logger.error('Invalid OPENROUTER_API_KEY: key appears too short');
    console.error('Error: OPENROUTER_API_KEY appears to be invalid (too short)');
    process.exit(1);
  }

  // Direct console output for debugging
  console.error(`[DEBUG] API Key loaded: length=${apiKey.length}, prefix=${apiKey.substring(0, 15)}...`);

  logger.info('Environment validation passed', {
    apiKeyLength: apiKey.length,
    apiKeyPrefix: apiKey.substring(0, 15) + '...',
  });
  return { apiKey };
}

// ============================================================================
// Signal Handlers
// ============================================================================

export function setupSignalHandlers(server: OpenRouterServer, sessionManager: SessionManager): void {
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    try {
      // Stop session cleanup worker
      sessionManager.stopCleanupWorker();

      await server.stop();
      logger.info('Server stopped successfully');
      process.exit(0);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error during shutdown', { error: errorMessage });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    process.exit(1);
  });

  logger.debug('Signal handlers configured');
}

// ============================================================================
// Tool Registration
// ============================================================================

export function registerTools(
  server: OpenRouterServer,
  client: OpenRouterClient,
  sessionManager: SessionManager,
  costTracker: CostTracker
): void {
  const toolLogger = logger.child('tools');

  // Register openrouter_list_models tool
  const listModelsTool = createListModelsTool({
    client,
    logger: toolLogger,
  });
  server.registerTool(listModelsTool);

  // Register openrouter_search_models tool
  const searchModelsTool = createSearchModelsTool({
    client,
    logger: toolLogger,
  });
  server.registerTool(searchModelsTool);

  // Register openrouter_chat tool
  const chatTool = createChatTool({
    client,
    sessionManager,
    costTracker,
    logger: toolLogger,
  });
  server.registerTool(chatTool);

  // Register openrouter_generate_image tool
  const imageGenerationTool = createImageGenerationTool({
    client,
    costTracker,
    logger: toolLogger,
  });
  server.registerTool(imageGenerationTool);

  // Register openrouter_get_credits tool
  const getCreditsTool = createGetCreditsTool({
    client,
    logger: toolLogger,
  });
  server.registerTool(getCreditsTool);

  // Register openrouter_get_cost_summary tool
  const getCostSummaryTool = createGetCostSummaryTool({
    costTracker,
    logger: toolLogger,
  });
  server.registerTool(getCostSummaryTool);

  toolLogger.info('All tools registered', {
    tools: server.getRegisteredTools(),
  });
}

// ============================================================================
// Main Entry Point
// ============================================================================

export async function main(): Promise<void> {
  logger.info('OpenRouter MCP Server starting...', {
    nodeVersion: process.version,
    platform: process.platform,
  });

  // Validate environment
  const { apiKey } = validateEnvironment();

  // Create API client
  const client = new OpenRouterClient({
    apiKey,
    logger: logger.child('api'),
  });

  // Create session manager with cleanup worker
  const sessionManager = new SessionManager(
    {
      sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
      cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
    },
    logger.child('session')
  );

  // Start session cleanup worker
  sessionManager.startCleanupWorker();

  // Create cost tracker
  const costTracker = new CostTracker({
    logger: logger.child('cost'),
  });

  // Create server instance
  const server = new OpenRouterServer({
    apiKey,
    logger: logger.child('server'),
  });

  // Set up signal handlers
  setupSignalHandlers(server, sessionManager);

  // Register tools
  registerTools(server, client, sessionManager, costTracker);

  // Start the server
  try {
    await server.start();
    logger.info('OpenRouter MCP Server is ready to accept connections');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to start server', { error: errorMessage });
    process.exit(1);
  }
}

// Only run main if this is the entry point (not imported as a module)
// Check if we're running directly vs being imported for testing
const isDirectRun = process.argv[1]?.includes('index') ||
                    process.argv[1]?.includes('openrouter-mcp-server');

if (isDirectRun && !process.env['VITEST']) {
  main().catch((error) => {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Fatal error during startup', { error: errorMessage });
    process.exit(1);
  });
}
