import { isMainThread, parentPort, workerData, Worker } from 'node:worker_threads';
import { optimize, Config as SvgoConfig } from 'svgo'
import { outputFile } from 'fs-extra/esm';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';
import { vectorize, Config as VectorizeConfig } from '@neplex/vectorizer';

import { createLock } from './lock.js';
import { IconSource } from './sources.js';
import { catchFileNotFound } from './fs.js';
import { ToolConfig } from './config.js';

export async function compile(sources: IconSource[], config: ToolConfig, oncompilation: (compilation: CompilationResult) => void): Promise<CompilationResult[]> {
    const compile = async (source: IconSource): Promise<CompilationResult> => {
        return new Promise((resolve, reject) => {
            const logger = config.logger?.createLogger(`compile[${source.path}]`);
            const worker = new Worker(import.meta.filename, {
                name: `compile[${source.path}]`,
                workerData: {
                    optimize: config.compilation.getOptimizeArgs(source),
                    output: config.outputs.dist,
                    source,
                    vectorize: config.compilation.getVectorizeArgs(source),
                },
            });

            worker.on('error', reject);
            worker.on('exit', code => {
                if (code !== 0) {
                    return reject(new Error(`Worker exited with a non-zero exit code of '${code}'`));
                }
            });

            worker.on('message', (message: WorkerMessage) => {
                logger?.debug(`entered stage '${message.stage}', ` + (JSON.stringify(message.result) ?? ''));
                if (message.stage === 'completed') {
                    worker.terminate();
                    return resolve(message.result!);
                }
            });
        })
    };

    const lock = createLock(config.concurrency);
    return await Promise.all(
        sources.map(async source => {
            await lock.acquire();
            try {
                return await compile(source);
            } finally {
                lock.release();
            }
        }).map(compile => compile.then(compilation => {
            oncompilation(compilation)
            return compilation;
        })));
};

if (!isMainThread) {
    const context: WorkerContext = {
        data: <WorkerData>workerData,
        stage: 'started',
        post(stage: CompilationStage, result?: CompilationResult) {
            this.stage = stage;
            parentPort?.postMessage({ result, stage });
        }
    };

    const start = performance.now();
    context.post('started');

    try {
        const result = await getAsVector(context).then(data => {
            if (!data) {
                return;
            }

            context.post('optimizing');
            return optimize(data, context.data.optimize);
        });

        const output = path.join(context.data.output, context.data.source.category, `${context.data.source.name}.svg`);
        if (!result) {
            throw new Error(`Failed to compile '${context.data.source.path}' to '${output}'.This source file may not exist.`);
        }

        context.post('writing');
        await outputFile(output, result.data, {
            encoding: 'utf-8'
        });

        context.post('completed', {
            duration: performance.now() - start,
            path: output,
            source: context.data.source,
            stage: context.stage ?? 'completed',
        });
    } catch (e) {
        const error = <NodeJS.ErrnoException>e;
        context.post('completed', {
            duration: performance.now() - start,
            error: {
                code: error.code,
                message: error.message,
                name: error.name,
                errno: error.errno,
                path: error.path,
                stack: error.stack?.toString(),
            },
            source: context.data.source,
            stage: context.stage ?? 'started',
        });
    }
}

async function getAsVector(context: WorkerContext): Promise<string | undefined> {
    if (path.extname(context.data.source.path) == '.svg') {
        context.post('reading');
        return readFile(context.data.source.path, 'utf-8');
    }

    context.post('reading');
    const file = await readFile(context.data.source.path).catch(catchFileNotFound());
    if (!file) {
        return;
    }

    context.post('vectorizing');
    return await vectorize(file, context.data.vectorize);
}

export type CompilationError = NodeJS.ErrnoException;
export type CompilationResult = {
    duration: number;
    error?: CompilationError;
    path?: string;
    source: IconSource;
    stage: CompilationStage;
};

export type CompilationStage = 'started' | 'reading' | 'vectorizing' | 'optimizing' | 'writing' | 'completed';

type WorkerContext = {
    data: WorkerData;
    stage?: CompilationStage;
    post(status: CompilationStage, result?: CompilationResult): void;
};

type WorkerData = {
    optimize: SvgoConfig;
    output: string;
    source: IconSource;
    vectorize: VectorizeConfig;
};

type WorkerMessage = {
    result?: CompilationResult;
    stage: CompilationStage;
};