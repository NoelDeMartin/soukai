import { URL, fileURLToPath } from 'node:url';

import dts from 'unplugin-dts/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        sourcemap: true,
        lib: {
            entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
            formats: ['es'],
            fileName: 'soukai-solid',
        },
        rollupOptions: {
            external: ['@noeldemartin/solid-utils', '@noeldemartin/utils', 'soukai'],
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
            'soukai-solid': fileURLToPath(new URL('./src/', import.meta.url)),
        },
    },
    test: {
        setupFiles: ['./src/testing/setup.ts'],
    },
});
