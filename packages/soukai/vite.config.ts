import { URL, fileURLToPath } from 'node:url';

import { pack } from '@noeldemartin/vite-plus-config';
import { defineConfig } from 'vite-plus';

export default defineConfig({
    pack: {
        ...pack,
        entry: {
            index: 'src/index.ts',
            testing: 'src/testing/index.ts',
        },
    },
    resolve: {
        alias: {
            soukai: fileURLToPath(new URL('./src/', import.meta.url)),
        },
    },
    test: {
        setupFiles: ['./src/testing/setup.ts'],
    },
});
