import { URL, fileURLToPath } from 'node:url';

import { pack } from '@noeldemartin/vite-plus-config';
import { defineConfig } from 'vite-plus';

export default defineConfig({
    pack: {
        ...pack,
        entry: {
            index: 'src/index.ts',
            'patch-zod': 'src/patch-zod.ts',
        },
    },
    resolve: {
        alias: {
            'soukai-bis': fileURLToPath(new URL('./src/', import.meta.url)),
        },
    },
    test: {
        setupFiles: ['./src/testing/setup.ts'],
    },
});
