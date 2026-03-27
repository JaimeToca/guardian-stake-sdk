export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Logger interface that can be implemented by any logging library
 * (console, winston, pino, etc.) or by the built-in ConsoleLogger.
 *
 * Pass an implementation to the chain factory to enable logging:
 * @example
 * ```ts
 * import { ConsoleLogger } from "@guardian/sdk";
 * import { bsc } from "@guardian/bsc";
 *
 * const sdk = new GuardianSDK([
 *   bsc({ rpcUrl: "...", logger: new ConsoleLogger("debug") }),
 * ]);
 * ```
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/** Default logger — does nothing. Used when no logger is provided. */
export class NoopLogger implements Logger {
  debug() {}
  info() {}
  warn() {}
  error() {}
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * Built-in console logger with level filtering and structured output.
 *
 * @example
 * ```ts
 * new ConsoleLogger("debug") // show all logs
 * new ConsoleLogger("info")  // show info, warn, error (default)
 * new ConsoleLogger("warn")  // show warn and error only
 * ```
 */
export class ConsoleLogger implements Logger {
  private readonly minRank: number;

  constructor(level: LogLevel = "info") {
    this.minRank = LEVEL_RANK[level];
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.minRank <= 0) this.print("DEBUG", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.minRank <= 1) this.print("INFO", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.minRank <= 2) this.print("WARN", message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (this.minRank <= 3) this.print("ERROR", message, context);
  }

  private print(level: string, message: string, context?: Record<string, unknown>): void {
    const ts = new Date().toISOString();
    const ctx = context !== undefined ? ` ${JSON.stringify(context)}` : "";
    console.log(`[${ts}] [guardian] [${level}] ${message}${ctx}`);
  }
}
