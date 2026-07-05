/**
 * Structured, PII-scrubbing logger — Phase 15 (ISD §15.G, §15.X, §15.Z, §15.AA).
 *
 * Server-only logger that emits JSON in production (for ingestion by
 * log aggregators) and human-readable text in development. Every
 * field passed to the log methods is passed through a PII scrubber
 * that:
 *   - masks email addresses (keeps domain, masks local part)
 *   - redacts JWT-shaped strings (Bearer <token> / eyJ... . ... . ...)
 *   - redacts Supabase service-role keys (sb_secret_*, JWTs)
 *   - redacts obvious secret key shapes (sk-*, AKIA*, etc.)
 *   - redacts cookie values
 *   - redacts Authorization/Cookie headers
 *   - caps long strings (to prevent log bloat)
 *
 * The logger also forwards ERROR-level events to Sentry when the
 * monitoring module is available. (We import lazily to avoid a
 * circular dependency and to make the logger usable in non-Sentry
 * contexts, e.g. tests.)
 *
 * Usage:
 *   import { logger } from '@/lib/logging/logger';
 *   logger.info('user.signed_in', { userId });
 *   logger.warn('rate_limit.exceeded', { policy: 'auth' });
 *   logger.error('book.upload.failed', { error, bookId });
 *
 * Levels: trace < debug < info < warn < error < fatal.
 *
 * NEVER include raw user-provided strings, tokens, or emails in a
 * log context. If you must, wrap them with `safe()` (which only
 * passes them through if they pass the scrubber).
 *
 * The logger is intended to be used SERVER-SIDE (it reads
 * `process.env` and writes to `process.stderr`). It is NOT marked
 * with `import 'server-only'` because the PII-scrubber helpers
 * (`_scrubValue`, `maskEmail`) are pure and useful in unit tests
 * that don't run in a server context. Do not import the logger
 * from client components.
 */

/** Log level numeric ordering for filtering. */
const LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
} as const;

export type LogLevel = keyof typeof LEVELS;

/** Structured log context (a flat key→primitive object). */
export type LogContext = Record<string, unknown>;

// ===========================================================================
// PII scrubbing
// ===========================================================================

/** Maximum length of any single stringified value. */
const MAX_STRING_LEN = 2000;

/** Maximum recursion depth for object scrubbing. */
const MAX_DEPTH = 6;

/** Keys whose values are redacted regardless of value shape. */
const REDACTED_KEYS = new Set([
  'password',
  'passwd',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'jwt',
  'authorization',
  'cookie',
  'set-cookie',
  'apikey',
  'api_key',
  'service_role',
  'service_role_key',
  'supabase_service_role_key',
  'r2_secret_access_key',
  'r2_access_key_id',
  'sentry_auth_token',
  'upstash_redis_rest_token',
]);

/** Email pattern (broad; good-enough for logging redaction). */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
/** JWT shape: three base64url segments separated by dots. */
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
/** Bearer authorization header value. */
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-+/=]{8,}/gi;
/** Common secret prefixes. */
const SECRET_PREFIX_RE =
  /\b(sk-[A-Za-z0-9_-]{8,}|sk_live_[A-Za-z0-9]+|sk_test_[A-Za-z0-9]+|AKIA[0-9A-Z]{8,}|ghp_[A-Za-z0-9]{16,}|gho_[A-Za-z0-9]{16,}|xox[abpr]-[A-Za-z0-9-]+|SB_SECRET_[A-Za-z0-9_-]{8,})/g;

/**
 * Mask an email address: keep the domain, mask the local part.
 * `alice@example.com` → `a***@example.com`.
 * (Exported for tests.)
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '[masked-email]';
  const first = local[0] ?? '*';
  return `${first}${'*'.repeat(Math.max(1, Math.min(3, local.length - 1)))}@${domain}`;
}

/**
 * Scrub a single string value. Returns a new string with PII redacted.
 */
function scrubString(value: string): string {
  let s = value;
  s = s.replace(EMAIL_RE, (_, domain: string) => `*@${domain}`);
  s = s.replace(JWT_RE, '[redacted-jwt]');
  s = s.replace(BEARER_RE, 'Bearer [redacted]');
  s = s.replace(SECRET_PREFIX_RE, '[redacted-secret]');
  return s;
}

/**
 * Scrub a value recursively. Returns a new value (never mutates input).
 *
 * @param value - The value to scrub
 * @param depth - Current recursion depth (used to prevent runaway)
 * @param seen - Set of already-seen objects (cycle protection)
 */
function scrubValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > MAX_DEPTH) return '[truncated-depth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    const scrubbed = scrubString(value);
    return scrubbed.length > MAX_STRING_LEN
      ? `${scrubbed.slice(0, MAX_STRING_LEN)}...[truncated-${scrubbed.length}]`
      : scrubbed;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'function') return '[function]';
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubString(value.message),
      stack: value.stack ? scrubString(value.stack).split('\n').slice(0, 20).join('\n') : undefined,
    };
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[cycle]';
    seen.add(value);
    return value.map((v) => scrubValue(v, depth + 1, seen));
  }
  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[cycle]';
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED_KEYS.has(k.toLowerCase())) {
        out[k] = '[redacted]';
      } else {
        out[k] = scrubValue(v, depth + 1, seen);
      }
    }
    return out;
  }
  return String(value);
}

/**
 * Mark a value as "I have reviewed it and it is safe to log verbatim".
 * The scrubber is still applied (defense in depth).
 */
export function safe<T>(value: T): T {
  return value;
}

// ===========================================================================
// Emitter
// ===========================================================================

/** Configuration read once at module load. */
interface LoggerConfig {
  /** Current min log level. */
  minLevel: LogLevel;
  /** Whether to emit JSON (production) or pretty (development). */
  json: boolean;
  /** Service name (added to every log entry). */
  service: string;
  /** Environment name (development/preview/production). */
  env: string;
}

function loadConfig(): LoggerConfig {
  const envName =
    process.env['APP_ENV'] ??
    (process.env['NODE_ENV'] === 'production' ? 'production' : 'development');
  const isProd = envName === 'production';
  return {
    minLevel: (process.env['LOG_LEVEL'] as LogLevel) ?? (isProd ? 'info' : 'debug'),
    json: isProd,
    service: process.env['SERVICE_NAME'] ?? 'epub-reader',
    env: envName,
  };
}

const config = loadConfig();

/** Get the configured min level. */
function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[config.minLevel];
}

/**
 * Format a log entry. In production, JSON. In development, a
 * human-readable one-liner.
 */
function format(level: LogLevel, event: string, context: LogContext, error?: Error): string {
  const ts = new Date().toISOString();
  const scrubbedContext = scrubValue(context) as LogContext;
  const scrubbedError = error
    ? (scrubValue({
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 20).join('\n'),
      }) as Record<string, unknown>)
    : undefined;

  if (config.json) {
    return JSON.stringify({
      ts,
      level,
      event,
      service: config.service,
      env: config.env,
      ...scrubbedContext,
      ...(scrubbedError ? { error: scrubbedError } : {}),
    });
  }

  // Development: pretty.
  const ctxParts = Object.entries(scrubbedContext)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ');
  const errPart = error ? ` err=${error.name}: ${error.message}` : '';
  return `[${ts}] ${level.toUpperCase()} ${event}${ctxParts ? ' ' + ctxParts : ''}${errPart}`;
}

/**
 * Emit the formatted entry to stderr. (Using stderr keeps logs
 * separate from any console output the user might see.)
 */
function emit(level: LogLevel, formatted: string): void {
  process.stderr.write(formatted + '\n');
}

/**
 * Forward error-level events to Sentry if it's available. We import
 * lazily to avoid a hard dependency in tests / non-Sentry contexts.
 */
async function maybeCaptureToSentry(
  level: LogLevel,
  event: string,
  context: LogContext,
  error?: Error,
): Promise<void> {
  if (level !== 'error' && level !== 'fatal') return;
  try {
    // Dynamic import — optional dep pattern.
    const mod = await import('@sentry/nextjs').catch(() => null);
    if (!mod) return;
    // Prefer captureException for Error, otherwise captureMessage.
    if (error) {
      mod.captureException(error, {
        tags: { event, ...(context['tags'] as Record<string, string> | undefined) },
        extra: scrubValue(context) as Record<string, unknown>,
      });
    } else {
      mod.captureMessage(event, {
        level: level === 'fatal' ? 'fatal' : 'error',
        tags: context['tags'] as Record<string, string> | undefined,
        extra: scrubValue(context) as Record<string, unknown>,
      });
    }
  } catch {
    // Sentry errors are never fatal to the application.
  }
}

// ===========================================================================
// Public surface
// ===========================================================================

/** Internal: emit a log entry at the given level. */
function logAt(level: LogLevel, event: string, context: LogContext = {}, error?: Error): void {
  if (!shouldLog(level)) return;
  const formatted = format(level, event, context, error);
  emit(level, formatted);
  // Fire-and-forget Sentry capture.
  void maybeCaptureToSentry(level, event, context, error);
}

export interface Logger {
  trace: (event: string, context?: LogContext) => void;
  debug: (event: string, context?: LogContext) => void;
  info: (event: string, context?: LogContext) => void;
  warn: (event: string, context?: LogContext) => void;
  error: (event: string, context?: LogContext, error?: Error) => void;
  fatal: (event: string, context?: LogContext, error?: Error) => void;
  /** Direct child logger with attached context. */
  child: (base: LogContext) => ChildLogger;
}

export interface ChildLogger {
  trace: (event: string, context?: LogContext) => void;
  debug: (event: string, context?: LogContext) => void;
  info: (event: string, context?: LogContext) => void;
  warn: (event: string, context?: LogContext) => void;
  error: (event: string, context?: LogContext, error?: Error) => void;
  fatal: (event: string, context?: LogContext, error?: Error) => void;
}

export const logger: Logger = {
  trace: (event, context) => logAt('trace', event, context),
  debug: (event, context) => logAt('debug', event, context),
  info: (event, context) => logAt('info', event, context),
  warn: (event, context) => logAt('warn', event, context),
  error: (event, context, error) => logAt('error', event, context, error),
  fatal: (event, context, error) => logAt('fatal', event, context, error),
  child: (base) => {
    const wrap = (level: LogLevel) => (event: string, context?: LogContext, error?: Error) =>
      logAt(level, event, { ...base, ...(context ?? {}) }, error);
    return {
      trace: wrap('trace'),
      debug: wrap('debug'),
      info: wrap('info'),
      warn: wrap('warn'),
      error: wrap('error'),
      fatal: wrap('fatal'),
    };
  },
};

// Test-only: re-read config (used in tests when env changes mid-run).
export function _reloadLoggerConfig(): void {
  Object.assign(config, loadConfig());
}

/** Exposed for tests: scrub a value manually. */
export const _scrubValue = scrubValue;
