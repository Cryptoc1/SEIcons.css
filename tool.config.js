/** @type {import('./tool/config').ToolConfigBuilder} */
export default {
    concurrency: 6,
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
        name: 'seicons',
        variablePrefix: 'seicon',
    },
};