import loggerConfig, { type LogLevel } from '@config/logger.config.js';

type LogMeta = Record<string, unknown>;

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private currentLevel: number;

  constructor() {
    this.currentLevel = LOG_LEVELS[loggerConfig.level];
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= this.currentLevel;
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatPretty(level: string, message: string, error?: Error | unknown, meta?: LogMeta): string {
    const timestamp = this.formatTimestamp();
    let output = `[${level.toUpperCase()}] ${timestamp} ${message}`;
    
    if (error) {
      if (error instanceof Error) {
        output += `\n  Error: ${error.name}: ${error.message}`;
        if (error.stack) {
          output += `\n  Stack: ${error.stack.split('\n').slice(0, 3).join('\n    ')}`;
        }
      } else {
        output += `\n  Error: ${String(error)}`;
      }
    }
    
    if (meta && Object.keys(meta).length > 0) {
      output += ` ${JSON.stringify(meta)}`;
    }
    
    return output;
  }

  private formatJson(level: string, message: string, error?: Error | unknown, meta?: LogMeta): string {
    const logEntry: Record<string, unknown> = {
      level: level.toLowerCase(),
      timestamp: this.formatTimestamp(),
      message,
    };

    if (error) {
      if (error instanceof Error) {
        logEntry.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      } else {
        logEntry.error = { message: String(error) };
      }
    }

    if (meta && Object.keys(meta).length > 0) {
      logEntry.meta = meta;
    }

    return JSON.stringify(logEntry);
  }

  private log(level: LogLevel, message: string, error?: Error | unknown, meta?: LogMeta): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const formatted = loggerConfig.format === 'json'
      ? this.formatJson(level, message, error, meta)
      : this.formatPretty(level, message, error, meta);

    const output = level === 'error' ? process.stderr : process.stdout;
    output.write(formatted + '\n');
  }

  debug(message: string, meta?: LogMeta): void {
    this.log('debug', message, undefined, meta);
  }

  info(message: string, meta?: LogMeta): void {
    this.log('info', message, undefined, meta);
  }

  warn(message: string, meta?: LogMeta): void {
    this.log('warn', message, undefined, meta);
  }

  error(message: string, error?: Error | unknown, meta?: LogMeta): void {
    this.log('error', message, error, meta);
  }
}

const logger = new Logger();

export default logger;

