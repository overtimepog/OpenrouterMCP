/**
 * Structured logging utility for the OpenRouter MCP Server.
 * Outputs JSON-formatted logs for observability.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export interface LoggerConfig {
  level: LogLevel;
  name?: string;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private readonly config: LoggerConfig;
  private readonly name: string;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: config.level ?? 'info',
      name: config.name,
    };
    this.name = config.name ?? 'openrouter-mcp';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.level];
  }

  private formatEntry(level: LogLevel, message: string, context?: Record<string, unknown>): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (context && Object.keys(context).length > 0) {
      entry.context = context;
    }

    return entry;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry = this.formatEntry(level, message, {
      ...context,
      logger: this.name,
    });

    const jsonOutput = JSON.stringify(entry);

    // Use stderr for all logging to keep stdout clean for MCP protocol
    switch (level) {
      case 'error':
        console.error(jsonOutput);
        break;
      case 'warn':
        console.warn(jsonOutput);
        break;
      default:
        // Debug and info also go to stderr to not interfere with stdio transport
        console.error(jsonOutput);
        break;
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  child(name: string): Logger {
    return new Logger({
      ...this.config,
      name: `${this.name}:${name}`,
    });
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }
}

// Default logger instance
export const logger = new Logger({
  level: (process.env['LOG_LEVEL'] as LogLevel) ?? 'info',
  name: 'openrouter-mcp',
});

export default logger;
