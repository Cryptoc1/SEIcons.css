import ansi from 'ansi-colors';
import { emptyDir, outputJson } from 'fs-extra/esm';
import dFormat from 'humanize-duration';
import path from 'path';

import { compile, CompilationResult, } from './compiler.js';
import { getSourceAssets, IconSourceMap } from './sources.js';
import { readConfigJs, ToolConfig } from './config.js';
import { generate, GenerationResult } from './generator.js';

await (async () => {
    const config = await readConfigJs();
    console.log(`Loaded ${ansi.bold('./tool.config.js')}!\n`);

    await emptyDir(config.outputs.obj!).then(() => config.logger?.debug(`initialized obj directory: '${config.outputs.obj}'`));
    await emptyDir(config.outputs.dist!).then(() => config.logger?.debug(`initialized output directory: '${config.outputs.dist}'`));

    const map = await getSourceAssets(config);
    await writeSourcesJson(map, config);

    for (const category of Object.keys(map)) {
        const dir = path.join(config.outputs.dist, category);
        await emptyDir(dir);

        config.logger?.debug(`created output directory for category: '${dir}'`);
    }

    const sources = Object.values(map)
        .map(category => Object.values(category))
        .reduce((sources, category) => [...sources, ...category], []);

    config.logger?.debug(`Discovered '${sources.length}' sources`);
    console.log(`Discovered ${ansi.bold(ansi.cyan(`${sources.length}`))} sources, starting compile:`);

    let start = performance.now();
    const compilations = await compile(sources, config, compilation => {
        if (compilation.error) {
            console.error(ansi.red(`${JSON.stringify(compilation, null, 2)}\n`));
        }
    }).then(compilations => {
        const duration = dFormat(performance.now() - start, { delimiter: ' and ', maxDecimalPoints: 2 });
        const failures = compilations.reduce((count, result) => result.error ? count + 1 : count, 0);

        config.logger?.debug(`compile completed in '${duration}' (${compilations.length} results, ${failures} failures)`);
        console.log(`Compiled ${ansi.green(ansi.bold(`${compilations.length - failures}`))} sources in ${duration}, with ${ansi.red(ansi.bold(`${failures}`))} failure(s)\n`);

        return compilations;
    });

    console.log(`Generating Assets:`);
    start = performance.now();

    const generations = await generate(compilations, config, generation => {
        if (generation.error) {
            console.error(ansi.red(`${JSON.stringify(generation, null, 2)}\n`));
            return;
        }

        console.log(`${ansi.green(generation.path)}`);
    }).then(generations => {
        const duration = dFormat(performance.now() - start, { delimiter: ' and ', maxDecimalPoints: 2 });
        const failures = generations.reduce((count, result) => result.error ? count + 1 : count, 0);

        config.logger?.debug(`generate completed in '${duration}' (${generations.length} results, ${failures} failures)`);
        console.log(`\nGenerated ${ansi.green(ansi.bold(`${generations.length - failures}`))} assets in ${duration}, with ${ansi.red(ansi.bold(`${failures}`))} failure(s)`);

        return generations;
    });

    await writeResultsJson(compilations, generations, config);
    if (config.logger) {
        await config.logger.flush();
    }

    console.log(`\n${ansi.bold('DONE!')}`);
})();

async function writeResultsJson(compiled: CompilationResult[], generated: GenerationResult[], config: ToolConfig): Promise<CompilationResult[]> {
    const file = path.join(config.outputs.obj!, './results.json');
    await outputJson(file, { compiled, generated }, {
        encoding: 'utf-8',
        spaces: 2,
    });

    config.logger?.debug(`wrote results data file: '${file}'`);
    return compiled;
};

async function writeSourcesJson(sources: IconSourceMap, config: ToolConfig): Promise<IconSourceMap> {
    const file = path.join(config.outputs.obj, './sources.json');
    await outputJson(file, sources, {
        encoding: 'utf-8',
        spaces: 2,
    });

    config.logger?.debug(`wrote assets data file: '${file}'`);
    return sources;
};