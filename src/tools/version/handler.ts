/**
 * Handler for the openrouter_get_version tool.
 */

import { Logger } from '../../utils/logger.js';
import { VersionResponse } from './schema.js';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('../../../package.json') as { name: string; version: string };

export interface GetVersionHandlerDeps {
  logger: Logger;
}

/**
 * Format version response for display.
 */
function formatTextResponse(response: VersionResponse): string {
  const lines: string[] = [];

  lines.push('## OpenRouter MCP Server Version');
  lines.push('');
  lines.push(`**Name:** ${response.name}`);
  lines.push(`**Version:** ${response.version}`);
  lines.push(`**Node.js:** ${response.node_version}`);

  return lines.join('\n');
}

/**
 * Handle get version request.
 */
export async function handleGetVersion(
  deps: GetVersionHandlerDeps
): Promise<{
  textResponse: string;
  structuredResponse: VersionResponse;
}> {
  const { logger } = deps;

  logger.debug('Fetching version info');

  const response: VersionResponse = {
    name: pkg.name,
    version: pkg.version,
    node_version: process.version,
  };

  logger.info('Version info retrieved', {
    name: response.name,
    version: response.version,
    node_version: response.node_version,
  });

  return {
    textResponse: formatTextResponse(response),
    structuredResponse: response,
  };
}

export default handleGetVersion;
