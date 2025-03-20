import { URL, fileURLToPath } from 'node:url';

import dts from 'vite-plugin-dts';
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        sourcemap: true,
        lib: {
            entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
            formats: ['es'],
            fileName: 'soukai',
        },
        rollupOptions: {
            external: ['@noeldemartin/utils', 'idb'],
        },
    },
    plugins: [
        dts({
            rollupTypes: true,
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
