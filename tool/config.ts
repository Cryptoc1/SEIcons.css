import os from 'node:os';
import path from 'node:path';
import { Config as SvgoConfig } from 'svgo';
import { ColorMode, Hierarchical, PathSimplifyMode, Config as VectorizeConfig } from '@neplex/vectorizer';

import {
    createCompositeLogger,
    createConsoleLogger,
    createFileLogger,
    ILogger,
    LogLevel
} from './logging.js';
import { IconSource } from './sources.js';

export function getOptimizeArgs(): SvgoConfig {
    return {
        floatPrecision: 2,
        js2svg: { pretty: false },
        plugins: ['preset-default', 'removeDimensions']
    };
};

export function getVectorizeArgs(): VectorizeConfig {
    return {
        colorMode: ColorMode.Color,
        colorPrecision: 8,
        cornerThreshold: 0,
        hierarchical: Hierarchical.Stacked,
        filterSpeckle: 0,
        layerDifference: 0,
        lengthThreshold: 0,
        maxIterations: 8,
        mode: PathSimplifyMode.None,
        spliceThreshold: 0,
        pathPrecision: 2,
    };
}

export async function readConfigJs(): Promise<ToolConfig> {
    const builder = await import(path.resolve('./tool.config.js')).then(({ default: builder }) => <ToolConfigBuilder>builder);
    const toAbsolutePath = (value: string) => path.isAbsolute(value) ? value : path.resolve(value);

    const config: ToolConfig = {
        compilation: {
            getOptimizeArgs: builder.compilation?.getOptimizeArgs ? builder.compilation.getOptimizeArgs : getOptimizeArgs,
            getVectorizeArgs: builder.compilation?.getVectorizeArgs ? builder.compilation.getVectorizeArgs : getVectorizeArgs,
        },
        concurrency: builder.concurrency ?? os.cpus().length,
        outputs: {
            dist: toAbsolutePath(builder.outputs?.dist ?? './dist'),
            obj: toAbsolutePath(builder.outputs?.dist ?? './obj'),
        },
        src: {
            exclude: (typeof builder.src === 'object' ? builder.src?.exclude : undefined) ?? (() => false),
            path: typeof builder.src === 'string' ? toAbsolutePath(builder.src) : toAbsolutePath(builder.src.path),
        },
        stylesheet: {
            name: builder.stylesheet.name,
            variablePrefix: builder.stylesheet.variablePrefix ?? builder.stylesheet.name,
        }
    };

    if (typeof builder.logging === 'object') {
        const loggers = [];
        if (builder.logging.loggers?.console) {
            loggers.push(createConsoleLogger(builder.logging.level ?? LogLevel.info));
        }

        if (builder.logging.loggers?.file) {
            loggers.push(createFileLogger(typeof builder.logging.loggers.file === 'string' ? toAbsolutePath(builder.logging.loggers.file) : path.join(config.outputs.obj, './log.txt'), builder.logging.level ?? LogLevel.debug));
        }

        config.logger = loggers.length ? createCompositeLogger(...loggers) : undefined;
    } else if (typeof builder.logging === 'boolean' && builder.logging) {
        config.logger = createFileLogger(path.resolve(config.outputs.obj, './log.txt'));
    }

    return config;
};

export type ToolConfigBuilder = {
    compilation?: {
        getOptimizeArgs?(source: IconSource): SvgoConfig;
        getVectorizeArgs?(source: IconSource): VectorizeConfig;
    };
    concurrency?: number;
    logging?: {
        level?: LogLevel;
        loggers?: { console?: boolean; file?: boolean | string; };
    } | boolean;
    objdir?: string;
    outputs?: {
        dist: string;
        obj?: string;
    };
    src: string | {
        path: string;
        exclude?(source: IconSource): boolean;
    };
    stylesheet: {
        name: string;
        variablePrefix?: string;
    };
};

export type ToolConfig = {
    compilation: {
        getOptimizeArgs(source: IconSource): SvgoConfig;
        getVectorizeArgs(source: IconSource): VectorizeConfig;
    },
    concurrency: number;
    logger?: ILogger;
    outputs: {
        dist: string;
        obj: string;
    }
    src: {
        path: string;
        exclude(source: IconSource): boolean;
    };
    stylesheet: {
        name: string;
        variablePrefix: string;
    };
};