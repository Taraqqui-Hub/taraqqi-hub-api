/**
 * Simple structured logger for consistent logging
 * In production, you might want to use a more robust solution like winston or pino
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
	[key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

// Get minimum log level from environment
const MIN_LOG_LEVEL = (process.env.LOG_LEVEL || "info") as LogLevel;

function shouldLog(level: LogLevel): boolean {
	return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LOG_LEVEL];
}

function formatMessage(
	level: LogLevel,
	message: string,
	context?: LogContext
): string {
	const timestamp = new Date().toISOString();
	const levelStr = level.toUpperCase().padEnd(5);
	
	if (context && Object.keys(context).length > 0) {
		return `[${timestamp}] ${levelStr} ${message} ${JSON.stringify(context)}`;
	}
	
	return `[${timestamp}] ${levelStr} ${message}`;
}

/**
 * Log debug message (only in development)
 */
function debug(message: string, context?: LogContext): void {
	if (shouldLog("debug")) {
		console.log(formatMessage("debug", message, context));
	}
}

/**
 * Log info message
 */
function info(message: string, context?: LogContext): void {
	if (shouldLog("info")) {
		console.log(formatMessage("info", message, context));
	}
}

/**
 * Log warning message
 */
function warn(message: string, context?: LogContext): void {
	if (shouldLog("warn")) {
		console.warn(formatMessage("warn", message, context));
	}
}

/**
 * Log error message
 */
function error(message: string, err?: Error | unknown, context?: LogContext): void {
	if (shouldLog("error")) {
		const errorContext: LogContext = { ...context };
		
		if (err instanceof Error) {
			errorContext.error = {
				name: err.name,
				message: err.message,
				stack: err.stack,
			};
		} else if (err) {
			errorContext.error = err;
		}
		
		console.error(formatMessage("error", message, errorContext));
	}
}

/**
 * Create a child logger with preset context
 */
function child(baseContext: LogContext) {
	return {
		debug: (message: string, context?: LogContext) =>
			debug(message, { ...baseContext, ...context }),
		info: (message: string, context?: LogContext) =>
			info(message, { ...baseContext, ...context }),
		warn: (message: string, context?: LogContext) =>
			warn(message, { ...baseContext, ...context }),
		error: (message: string, err?: Error | unknown, context?: LogContext) =>
			error(message, err, { ...baseContext, ...context }),
	};
}

export const logger = {
	debug,
	info,
	warn,
	error,
	child,
};

export default logger;
