/**
 * Client-side logger. Use in "use client" components.
 * Level is controlled by NEXT_PUBLIC_LOG_LEVEL (error | warn | info | debug | silent).
 */

const LEVELS = {
  silent: 4,
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

type LogLevel = keyof typeof LEVELS;

function getClientLogLevel(): number {
  if (typeof window === "undefined") return LEVELS.warn;
  const raw = process.env.NEXT_PUBLIC_LOG_LEVEL?.toLowerCase().trim() ?? "";
  if (raw === "silent" || raw === "") return LEVELS.silent;
  if (raw in LEVELS) return LEVELS[raw as LogLevel];
  return LEVELS.warn;
}

let currentLevel = getClientLogLevel();

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
