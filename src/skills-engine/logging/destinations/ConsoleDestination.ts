import { LogEntry, LogDestination } from '../types';
import * as util from 'util';

export class ConsoleDestination implements LogDestination {
  private colors = {
    debug: '\x1b[36m', // cyan
    info: '\x1b[32m',  // green
    warn: '\x1b[33m',  // yellow
    error: '\x1b[31m', // red
    fatal: '\x1b[35m', // magenta
    audit: '\x1b[34m', // blue
    reset: '\x1b[0m'
  };

  write(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const color = this.colors[entry.level] || this.colors.info;

    let message = `${color}[${timestamp}] ${level} ${this.colors.reset}${entry.message}`;

    if (entry.correlationId) {
      message += ` ${color}(correlation: ${entry.correlationId})${this.colors.reset}`;
    }

    if (entry.skillId) {
      message += ` ${color}(skill: ${entry.skillId})${this.colors.reset}`;
    }

    if (entry.durationMs !== undefined) {
      message += ` ${color}(${entry.durationMs}ms)${this.colors.reset}`;
    }

    if (entry.context && Object.keys(entry.context).length > 0) {
      message += `\n${color}Context: ${util.inspect(entry.context, { depth: 2, colors: true })}${this.colors.reset}`;
    }

    if (entry.error) {
      const errorMessage = process.env.NODE_ENV === 'development'
        ? entry.error.stack || entry.error.message
        : entry.error.message;
      message += `\n${color}Error: ${errorMessage}${this.colors.reset}`;
    }

    const consoleMethod = this.getConsoleMethod(entry.level);
    consoleMethod(message);
  }

  private getConsoleMethod(level: string): (...args: any[]) => void {
    switch (level) {
      case 'debug': return console.debug;
      case 'info': return console.info;
      case 'warn': return console.warn;
      case 'error': return console.error;
      case 'fatal': return console.error;
      case 'audit': return console.log;
      default: return console.log;
    }
  }

  flush(): void {
    // Console doesn't need flushing
  }

  close(): void {
    // Console doesn't need closing
  }
}