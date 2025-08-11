/**
 * Simple logger utility for the whiteboard MCP server
 */
export class Logger {
  constructor(private context: string) {}

  info(message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: 'info',
      context: this.context,
      message,
      ...meta,
    };
    console.log(JSON.stringify(logEntry));
  }

  error(message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: 'error',
      context: this.context,
      message,
      ...meta,
    };
    console.error(JSON.stringify(logEntry));
  }

  warn(message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: 'warn',
      context: this.context,
      message,
      ...meta,
    };
    console.warn(JSON.stringify(logEntry));
  }

  debug(message: string, meta?: any): void {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        level: 'debug',
        context: this.context,
        message,
        ...meta,
      };
      console.debug(JSON.stringify(logEntry));
    }
  }
}