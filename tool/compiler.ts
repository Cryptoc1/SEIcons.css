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
    const lock = createLock(config.compilation.concurrency);
    return await Promise.all(
        sources.map(async source => {
            await lock.acquire();
            try {
                return await (config.compilation.workers ? compileInWorker : compileInProcess)(source, config);
            } finally {
                lock.release();
            }
        }).map(compile => compile.then(compilation => {
            oncompilation(compilation)
            return compilation;
        })));
};

if (!isMainThread) {
    const context: CompilationContext = {
        data: <CompilationData>workerData,
        post(stage: CompilationStage, result?: CompilationResult) {
            this.stage = stage;
            parentPort?.postMessage({ result, stage });
        }
    };

    await compileCore(context);
}

async function compileCore(context: CompilationContext): Promise<void> {
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
};

async function compileInProcess(source: IconSource, config: ToolConfig): Promise<CompilationResult> {
    const logger = config.logger?.createLogger(`compile[${source.path}]`);
    return new Promise((resolve) => compileCore({
        data: createCompilationData(source, config),
        post(stage, result) {
            logger?.debug(`entered stage '${stage}', ` + (JSON.stringify(result) ?? ''));

            if ((this.stage = stage) === 'completed') {
                resolve(result!);
            }
        },
    }));
};

async function compileInWorker(source: IconSource, config: ToolConfig): Promise<CompilationResult> {
    return new Promise((resolve, reject) => {
        const logger = config.logger?.createLogger(`compile[${source.path}]`);
        const worker = new Worker(import.meta.filename, {
            name: `compile[${source.path}]`,
            workerData: createCompilationData(source, config),
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

function createCompilationData(source: IconSource, config: ToolConfig): CompilationData {
    return {
        optimize: config.compilation.getOptimizeArgs(source),
        output: config.outputs.dist,
        source,
        vectorize: config.compilation.getVectorizeArgs(source),
    };
}

async function getAsVector(context: CompilationContext): Promise<string | undefined> {
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
};

export type CompilationError = NodeJS.ErrnoException;
export type CompilationResult = {
    duration: number;
    error?: CompilationError;
    path?: string;
    source: IconSource;
    stage: CompilationStage;
};

export type CompilationStage = 'started' | 'reading' | 'vectorizing' | 'optimizing' | 'writing' | 'completed';

type CompilationContext = {
    data: CompilationData;
    stage?: CompilationStage;
    post(stage: CompilationStage, result?: CompilationResult): void;
};

type CompilationData = {
    optimize: SvgoConfig;
    output: string;
    source: IconSource;
    vectorize: VectorizeConfig;
};

type WorkerMessage = {
    result?: CompilationResult;
    stage: CompilationStage;
};