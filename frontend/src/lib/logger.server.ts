/**
 * Server-side logger. Use in API routes and server components.
 * Level is controlled by LOG_LEVEL env (error | warn | info | debug | silent).
 */

const LEVELS = {
  silent: 4,
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

type LogLevel = keyof typeof LEVELS;

function getServerLogLevel(): number {
  const raw = process.env.LOG_LEVEL?.toLowerCase().trim() ?? "";
  if (raw === "silent" || raw === "") return LEVELS.silent;
  if (raw in LEVELS) return LEVELS[raw as LogLevel];
  return LEVELS.warn;
}

const currentLevel = getServerLogLevel();

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= currentLevel && currentLevel < LEVELS.silent;
}

export const logger = {
  error(...args: unknown[]) {
    if (shouldLog("error")) console.error(...args);
  },
  warn(...args: unknown[]) {
    if (shouldLog("warn")) console.warn(...args);
  },
  info(...args: unknown[]) {
    if (shouldLog("info")) console.log(...args);
  },
  debug(...args: unknown[]) {
    if (shouldLog("debug")) console.log(...args);
  },
};
