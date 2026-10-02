import { fmt, lint } from '@noeldemartin/vite-plus-config';
import { defineConfig } from 'vite-plus';

export default defineConfig({
    fmt: {
        ...fmt,
        ignorePatterns: ['docs/**'],
    },
    lint: {
        extends: [lint],
        ignorePatterns: ['docs/**', '**/.vitepress/**'],
    },
    test: {
        projects: ['packages/*'],
    },
});
