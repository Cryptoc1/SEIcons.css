import { glob } from 'glob';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

import { catchFileNotFound } from './fs.js';
import { Icon, IconCategory } from './icon.js';
import { ToolConfig } from './config.js';
import { ILogger } from './logging.js';

async function createSource(file: string, logger?: ILogger): Promise<IconSource | undefined> {
    const stats = await lstat(file).catch(catchFileNotFound());
    if (!stats) {
        return;
    }

    if (stats.isSymbolicLink()) {
        const resolved = await realpath(file).catch(catchFileNotFound());
        if (!resolved) {
            return;
        }

        logger?.debug(`resolved symbolic link: '${file}' -> '${resolved}'`);
        return createSource(resolved);
    }

    if (stats.isFile()) {
        const parsed = path.parse(file);
        if (['.png', '.svg'].includes(parsed.ext)) {
            const head = path.parse(parsed.dir);
            return {
                category: path.basename(head.dir),
                name: parsed.name,
                path: file,
                size: head.name
            };
        }
    }

    return;
};

export async function getSourceAssets(config: ToolConfig): Promise<IconSourceMap> {
    const assets: IconSourceMap = {};
    const getOrAddCategory = (category: IconCategory) => {
        if (!assets[category]) {
            assets[category] = {};
        }

        return assets[category];
    }

    const logger = config.logger?.createLogger('getSourceAssets');

    // NOTE: reduce source assets to largest sizes available; prefer existing vectors
    for (const source of await glob(path.join(config.src.path, '**/*'))
        .then(paths => Promise.all(paths.map(path => createSource(path, logger))))
        .then(sources => sources.filter(source => source != undefined).filter(source => !config.src.exclude(source)))) {

        const category = getOrAddCategory(source.category);
        if (!category[source.name]) {
            category[source.name] = source;
            continue;
        }

        const existing = category[source.name];
        if (source.path == existing.path) {
            continue;
        }

        if (source.size === 'scalable') {
            if (existing.size === 'scalable') {
                logger?.warn(`existing source '${existing.path}' is already scalable, target source: '${source.path}'`)
            }

            category[source.name] = source;
            continue;
        }

        if (existing.size === 'scalable') {
            logger?.debug(`skipping source '${source.path}', existing source '${source.path}' is scalable`)
            continue;
        }

        if (parseInt(source.size) > parseInt(existing.size)) {
            logger?.debug(`replaced source '${existing.path}' with '${source.path}'`)
            category[source.name] = source;
        }
    }

    return assets;
};

export type IconSource = Icon & {
    size: IconSourceSize;
};

export type IconSourceMap = Record<IconCategory, Record<string, IconSource>>;
export type IconSourceSize = string | 'scalable' | '8' | '10' | '12' | '16' | '22' | '24' | '32' | '48' | '64' | '72' | '96' | '128' | '160' | '192' | '256' | '512' | '1024';