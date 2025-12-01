type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
	private level: LogLevel;

	constructor() {
		this.level = (process.env.LOG_LEVEL as LogLevel) || 'info';
	}

	private shouldLog(level: LogLevel): boolean {
		const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
		return levels.indexOf(level) >= levels.indexOf(this.level);
	}

	private formatMessage(level: LogLevel, ...args: any[]): string {
		const timestamp = new Date().toISOString();
		const emoji = {
			debug: 'Checking',
			info: 'Market',
			warn: 'Warning',
			error: 'Error',
		}[level];

		return `${timestamp} ${emoji} [${level.toUpperCase()}]`;
	}

	debug(...args: any[]) {
		if (this.shouldLog('debug')) {
			console.log(this.formatMessage('debug', ...args), ...args);
		}
	}

	info(...args: any[]) {
		if (this.shouldLog('info')) {
			console.log(this.formatMessage('info', ...args), ...args);
		}
	}

	warn(...args: any[]) {
		if (this.shouldLog('warn')) {
			console.warn(this.formatMessage('warn', ...args), ...args);
		}
	}

	error(...args: any[]) {
		if (this.shouldLog('error')) {
			console.error(this.formatMessage('error', ...args), ...args);
		}
	}

	success(...args: any[]) {
		console.log(`${new Date().toISOString()}  [SUCCESS]`, ...args);
	}
}

export const logger = new Logger();
