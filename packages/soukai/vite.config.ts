import { URL, fileURLToPath } from 'node:url';

import { defineConfig } from 'vite-plus';

export default defineConfig({
    pack: {
        entry: {
            soukai: 'src/index.ts',
            testing: 'src/testing/index.ts',
        },
        sourcemap: true,
        dts: true,
        fixedExtension: false,
        publint: true,
        attw: { profile: 'esm-only' },
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
