import seicons from './package.json' with { type: 'json' };

/** @type {import('./tool/config').ToolConfigBuilder} */
export default {
    compilation: {
        concurrency: Infinity,
    },
    logging: true,
    src: {
        path: './ref/Win98SE/SE98/',
        exclude(source) {
            if (source.category === 'apps' && source.name.startsWith('chrome-')) {
                // NOTE: ignore custom chrome apps
                return true;
            }

            return false;
        }
    },
    stylesheet: {
        header: `${seicons.name} v${seicons.version} [${new Date().toISOString()}] (${seicons.repository.url}) <${seicons.author}>`,
        name: 'seicons',
        variablePrefix: 'seicon',
    },
};