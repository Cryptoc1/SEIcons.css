import autoprefixer from 'autoprefixer';
import cssnano from 'cssnano';
import HtmlMinifier from 'html-minifier-terser';
import { outputFile } from 'fs-extra/esm';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import postcss, { Result as PostCssResult, Root as PostCssRoot } from 'postcss';

import { CompilationResult } from './compiler.js';
import { Icon } from './icon.js';
import { ToolConfig } from './config.js';

export async function generate(compilations: CompilationResult[], config: ToolConfig, ongeneration: (generation: GenerationResult) => void): Promise<GenerationResult[]> {
    const logger = config.logger?.createLogger(`generator`);
    const sources = compilations.filter(compilation => !compilation.error)
        .map(compilation => compilation.source)
        .sort((a, b) => {
            const valueA = `${a.category}/${a.name}`;
            const valueB = `${b.category}/${b.name}`;

            if (valueA > valueB) {
                return 1;
            }

            if (valueA < valueB) {
                return -1;
            }

            return 0;
        });


    logger?.debug(`generating assets for ${sources.length} sources`);

    const results: GenerationResult[] = [];
    await Promise.all([(async () => {
        const start = performance.now();

        const { css, map } = await createStyleSheet(sources, config);
        const file = path.resolve(config.outputs.dist, `./${config.stylesheet.name}.min.css`);
        await outputFile(file, css, {
            encoding: 'utf8'
        });

        logger?.debug(`generated stylesheet at '${file}'`);
        const result: GenerationResult = {
            duration: performance.now() - start,
            path: file
        };

        results.push(result);
        ongeneration(result);

        return { map, start };
    })().then(async ({ map, start }) => {
        const file = path.resolve(config.outputs.dist, `./${config.stylesheet.name}.min.css.map`);
        await outputFile(file, map.toString(), {
            encoding: 'utf8'
        });

        logger?.debug(`generated stylesheet map at '${file}'`);

        const result: GenerationResult = {
            duration: performance.now() - start,
            path: file
        };

        results.push(result);
        ongeneration(result);
    }),
    (async () => {
        const start = performance.now();

        const file = path.resolve(config.outputs.dist, './index.html');
        await outputFile(file, await createPreviewHtml(sources, config), {
            encoding: 'utf8'
        });

        logger?.debug(`generated preview html at '${file}'`);

        const result: GenerationResult = {
            duration: performance.now() - start,
            path: file
        };

        results.push(result);
        ongeneration(result);
    })()]);

    return results;
};

async function createPreviewHtml(icons: Icon[], config: ToolConfig): Promise<string> {
    const createIconRow = (icon: Icon) => {
        const sizes = [96, 64, 48, 32, 24];
        const createIcon = (size: number) => `<div class="flex flex-col flex-1 items-center min-h-[${sizes[0]}px]">
    <div class="flex grow items-center">
        <i class="ring-1 ring-indigo-600/40" data-${config.stylesheet.variablePrefix}="${icon.category}/${icon.name}" style="--${config.stylesheet.variablePrefix}-size: ${size}px;"></i>
    </div>
    <span class="font-semibold pt-2 text-center text-sm text-neutral-800">${size}px</span>
</div>`;

        return `<a class="backdrop-blur bg-gradient-to-b from-zinc-50/80 to-zinc-100/80 block ring-1 ring-indigo-600/20 rounded shadow transition hover:ring-indigo-600/80 hover:shadow-md target:ring-4 target:ring-indigo-600/80 target:scroll-mt-2 target:shadow-lg" href="#${icon.category}/${icon.name}" id="${icon.category}/${icon.name}">
    <div class="backdrop-blur backdrop-saturate bg-indigo-900/60 bg-gradient-to-b from-indigo-800/80 to-indigo-800/80 border border-zinc-50/20 drop-shadow-sm font-semibold p-2 rounded shadow-sm text-zinc-50/95 tracking-wide z-10">${icon.category}/${icon.name}</div>
    <div class="drop-shadow-sm flex flex-row p-4 space-x-2">
        ${sizes.map(createIcon).join('\n\t')}
    </div>
</a>`;
    };

    return HtmlMinifier.minify(`<!DOCTYPE html>
<html lang="en">
    <head>
        <link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:ital,opsz,wght@0,6..12,200..1000;1,6..12,200..1000" rel="stylesheet" crossorigin />
        <link href="${config.stylesheet.name}.min.css" rel="stylesheet" />
        <style>
            body {
                font-optical-sizing: auto;
                font-variation-settings: "wdth" 100, "YTLC" 500;
            }
        </style>
        <script src="https://cdn.tailwindcss.com/3.4.16"></script>
    </head>

    <body class="antialiased bg-slate-200 bg-gradient-to-b from-violet-100/80 to-indigo-200/60 font-normal font-['Nunito_Sans'] gap-3 grid grid-cols-4 p-2 text-base">
        ${icons.map(createIconRow).join('\n\t')}
    </body>
</html>`, {
        collapseWhitespace: true,
        html5: true,
        minifyCSS: true,
        minifyJS: true,
        useShortDoctype: true,
    });
};

async function createStyleSheet(icons: Icon[], config: ToolConfig): Promise<PostCssResult<PostCssRoot>> {
    const getVariableName = (icon: Icon) => `--${config.stylesheet.variablePrefix}-${icon.category}-${icon.name}-url`;
    const createVariable = (icon: Icon) => `${getVariableName(icon)}: url('${icon.category}/${icon.name}.svg');`;
    const createRule = (icon: Icon) => `i[data-${config.stylesheet.variablePrefix}="${icon.category}/${icon.name}"] {
    background-image: var(${getVariableName(icon)}); 
    color: transparent;
}`;

    return postcss([autoprefixer, cssnano]).process(`:root {
    ${icons.map(createVariable).join('\n\t')}
}

i[data-${config.stylesheet.variablePrefix}] {
    aspect-ratio: 1 / 1;
    background-origin: content-box;
    background-position: center;
    background-repeat: no-repeat;
    background-size: contain;
    color: transparent;
    display: inline-block;
    font: revert;
    height: var(--${config.stylesheet.variablePrefix}-size, 24px);
    line-height: 1;
    overflow: hidden;
}

i[data-${config.stylesheet.variablePrefix}]::before {
    content: attr(--data-${config.stylesheet.variablePrefix});
}

${icons.map(createRule).join('\n\n')}`, { from: `${config.stylesheet.name}.css`, map: { inline: false }, to: `${config.stylesheet.name}.min.css` });
};

export type GenerationError = NodeJS.ErrnoException;
export type GenerationResult = {
    duration: number;
    error?: GenerationError;
    path: string;
};