import { URL, fileURLToPath } from 'node:url';

import dts from 'unplugin-dts/vite';
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        sourcemap: true,
        lib: {
            entry: {
                soukai: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
                testing: fileURLToPath(new URL('./src/testing/index.ts', import.meta.url)),
            },
            formats: ['es'],
            fileName: (_, entry) => (entry.includes('testing') ? 'testing.js' : 'soukai.js'),
        },
        rollupOptions: {
            external: ['@noeldemartin/utils', 'idb', 'vitest'],
        },
    },
    plugins: [
        dts({
            bundleTypes: true,
            tsconfigPath: './tsconfig.json',
            insertTypesEntry: true,
        }),
    ],
    resolve: {
        alias: {
            soukai: fileURLToPath(new URL('./src/', import.meta.url)),
        },
    },
});
