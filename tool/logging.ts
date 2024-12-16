import { outputFile } from 'fs-extra/esm';
import { performance } from 'node:perf_hooks';
import { createLock } from './lock.js';

export function createCompositeLogger(...loggers: ILogger[]): ILogger {
    return {
        source: '(composite)',

        createLogger(source) {
            return createCompositeLogger(...loggers.map(logger => logger.createLogger(source)));
        },

        async flush() {
            await Promise.all(loggers.map(logger => logger.flush()));
        },

        debug(message) {
            loggers.forEach(logger => logger.debug(message));
        },
        info(message) {
            loggers.forEach(logger => logger.info(message));
        },
        warn(message) {
            loggers.forEach(logger => logger.warn(message));
        },
    };
};

export function createConsoleLogger(level = LogLevel.info): ILogger {
    const createLogger = (source: string): ILogger => ({
        source,

        createLogger(suffix) {
            return createLogger(`${source}/${suffix}`);
        },

        async flush() {
            return;
        },

        debug(message) {
            if (level >= LogLevel.debug) {
                return console.debug(format(LogLevel.debug, source, message));
            }
        },
        info(message) {
            if (level >= LogLevel.info) {
                return console.info(format(LogLevel.info, source, message));
            }
        },
        warn(message) {
            if (level >= LogLevel.warning) {
                return console.warn(format(LogLevel.warning, source, message));
            }
        }
    });

    return createLogger('');
};

export function createFileLogger(file: string, level = LogLevel.debug): ILogger {
    const messages: { at: number, value: string }[] = [];

    const lock = createLock(1);
    const createLogger = (source: string): ILogger => ({
        source,

        createLogger(suffix) {
            return createLogger(`${source}/${suffix}`);
        },
        async flush() {
            await lock.acquire();

            try {
                const text = messages.toSorted((a, b) => a.at - b.at)
                    .reduce((value, message) => value + `[${new Date(performance.timeOrigin + message.at).toISOString()}] ${message.value}\n`, '');

                await outputFile(file, text, { encoding: 'utf-8' });
            } finally {
                lock.release();
            }
        },

        debug(message) {
            if (level >= LogLevel.debug) {
                messages.push({ at: performance.now(), value: format(LogLevel.debug, source, message) });
            }
        },
        info(message) {
            if (level >= LogLevel.info) {
                messages.push({ at: performance.now(), value: format(LogLevel.info, source, message) });
            }
        },
        warn(message) {
            if (level >= LogLevel.warning) {
                messages.push({ at: performance.now(), value: format(LogLevel.info, source, message) });
            }
        }
    });

    return createLogger('');
};

export function createNullLogger(): ILogger {
    return {
        source: '(null)',

        createLogger() {
            return createNullLogger();
        },

        async flush() {
            return;
        },

        debug() {
        },
        info() {
        },
        warn() {
        }
    };
};

const format = (level: LogLevel, source: string, message?: string) => `[${LogLevelNames[level]}] ${source}:\n\t${message}`;

export enum LogLevel {
    debug,
    info,
    warning,
};

const LogLevelNames = {
    [LogLevel.debug]: 'debug',
    [LogLevel.info]: 'info',
    [LogLevel.warning]: 'warn',
};

export type ILogger = {
    get source(): string;

    createLogger(source: string): ILogger;
    flush(): Promise<void>;

    debug(message?: string): void;
    info(message?: string): void;
    warn(message?: string): void;
};