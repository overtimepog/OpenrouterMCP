/**
 * Zod schema for the openrouter_get_version tool.
 */

import { z } from 'zod';

/**
 * Input schema for the get version tool (no parameters required)
 */
export const GetVersionInputSchema = z.object({}).describe(
  'No parameters required - retrieves server version information'
);

export type GetVersionInput = z.infer<typeof GetVersionInputSchema>;

/**
 * Response structure for the get version tool
 */
export interface VersionResponse {
  /** Package name */
  name: string;

  /** Server version from package.json */
  version: string;

  /** Node.js runtime version */
  node_version: string;
}

export default GetVersionInputSchema;
