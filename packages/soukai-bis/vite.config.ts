import { URL, fileURLToPath } from 'node:url';

import dts from 'unplugin-dts/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        sourcemap: true,
        lib: {
            entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
            formats: ['es'],
            fileName: 'soukai-bis',
        },
        rollupOptions: {
            external(source) {
                return !source.startsWith('.') && !source.startsWith('soukai-bis/') && !source.includes('/soukai-bis/');
            },
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
            'soukai-bis': fileURLToPath(new URL('./src/', import.meta.url)),
        },
    },
    test: {
        setupFiles: ['./src/testing/setup.ts'],
    },
});
