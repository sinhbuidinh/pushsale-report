import { ConsoleLogger, LogLevel } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { inspect } from 'node:util';
import { calendarDateInZone, formatLogTimestamp, getAppTimeZone } from './app-timezone';

const LOG_DIR = 'logs';

/** Nest bootstrap contexts we skip in console and log files. */
const SILENCED_LOG_CONTEXTS = new Set([
  'NestFactory',
  'InstanceLoader',
  'RoutesResolver',
  'RouterExplorer',
]);

function isFileLogEnabled(): boolean {
  return process.env.ENABLE_LOG?.trim().toLowerCase() === 'true';
}

function shouldSilenceNestBootstrap(context: string | undefined, logLevel: LogLevel): boolean {
  if (!context || !SILENCED_LOG_CONTEXTS.has(context)) {
    return false;
  }
  return logLevel === 'log' || logLevel === 'debug' || logLevel === 'verbose';
}

/** Log file name: calendar date in APP_TIMEZONE (rollover at local midnight in that zone). */
function logFileDateKey(): string {
  return calendarDateInZone(new Date(), getAppTimeZone());
}

export class FileConsoleLogger extends ConsoleLogger {
  constructor() {
    super();
  }

  getTimestamp(): string {
    return formatLogTimestamp(new Date());
  }

  private appendLogLine(line: string): void {
    const dir = path.join(process.cwd(), LOG_DIR);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${logFileDateKey()}.log`);
    fs.appendFileSync(filePath, line, 'utf8');
  }

  protected printMessages(
    messages: unknown[],
    context?: string,
    logLevel: LogLevel = 'log',
    writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
  ): void {
    if (shouldSilenceNestBootstrap(context, logLevel)) {
      return;
    }
    super.printMessages(messages, context, logLevel, writeStreamType, errorStack);
    if (this.options?.json || !isFileLogEnabled()) {
      return;
    }

    const ctx = context ? ` [${context}]` : '';
    const header = `${formatLogTimestamp()} [${logLevel.toUpperCase()}]${ctx}`;
    for (const message of messages) {
      const body =
        typeof message === 'string'
          ? message
          : inspect(message, { ...this.getInspectOptions(), colors: false });
      this.appendLogLine(`${header} ${body}\n`);
    }
  }

  protected printStackTrace(stack: string) {
    super.printStackTrace(stack);
    if (stack && !this.options?.json && isFileLogEnabled()) {
      this.appendLogLine(`${stack}\n`);
    }
  }
}
