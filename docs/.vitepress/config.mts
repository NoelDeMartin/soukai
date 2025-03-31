import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vitepress';
import { stringToTitleCase } from '@noeldemartin/utils';

export default defineConfig({
    title: 'Soukai',
    description: 'A JavaScript Active Record library',
    head: [
        ['link', { rel: 'icon', type: 'image/svg+xml', href: '/img/logo-mini.svg' }],
        ['meta', { name: 'theme-color', content: '#039be5' }],
        ['meta', { property: 'og:type', content: 'website' }],
        ['meta', { property: 'og:locale', content: 'en' }],
        ['meta', { property: 'og:title', content: 'Soukai | JavaScript Active Record library' }],
        ['meta', { property: 'og:site_name', content: 'Soukai' }],
        ['meta', { property: 'og:image', content: 'https://soukai.js.org/img/banner.png' }],
        ['meta', { property: 'og:url', content: 'https://soukai.js.org/' }],
    ],
    themeConfig: {
        logo: { src: '/img/logo-mini.svg', width: 17, height: 24 },
        search: { provider: 'local' },
        nav: [
            { text: 'Guide', link: '/guide/getting-started/installation', activeMatch: '/guide/' },
            { text: 'API', link: '/api/', activeMatch: '/api/' },
        ],
        sidebar: {
            '/guide/': {
                base: '/guide/',
                items: [
                    {
                        text: 'Getting started',
                        base: '/guide/getting-started/',
                        collapsed: true,
                        items: [
                            { text: 'Installation', link: 'installation' },
                            { text: 'Configuration', link: 'configuration' },
                        ],
                    },
                    {
                        text: 'Core concepts',
                        base: '/guide/core-concepts/',
                        collapsed: true,
                        items: [
                            { text: 'Models', link: 'models' },
                            { text: 'Engines', link: 'engines' },
                            { text: 'Relationships', link: 'relationships' },
                        ],
                    },
                    {
                        text: 'Solid Protocol',
                        base: '/guide/solid-protocol/',
                        collapsed: true,
                        items: [
                            { text: 'What is Solid?', link: 'what-is-solid' },
                            { text: 'Solid Models', link: 'solid-models' },
                            { text: 'Limitations', link: 'limitations' },
                        ],
                    },
                    {
                        text: 'Advanced',
                        base: '/guide/advanced/',
                        collapsed: true,
                        items: [
                            { text: 'TypeScript', link: 'typescript' },
                            { text: 'Interoperability', link: 'interoperability' },
                            { text: 'History tracking', link: 'history-tracking' },
                            { text: 'Authorization', link: 'authorization' },
                            { text: 'Observability', link: 'observability' },
                        ],
                    },
                    {
                        text: 'Examples',
                        base: '/guide/examples/',
                        collapsed: true,
                        items: [
                            { text: 'Hello World', link: 'hello-world' },
                            { text: 'Hello World (using Solid)', link: 'hello-world-using-solid' },
                            { text: 'Blog', link: 'blog' },
                            { text: 'Tasks Manager (using Solid)', link: 'tasks-manager' },
                            { text: 'Apps', link: 'apps' },
                        ],
                    },
                ],
            },
            '/api/': apiSidebar(),
        },
        outline: { level: [2, 3] },
        socialLinks: [{ icon: 'github', link: 'https://github.com/NoelDeMartin/soukai' }],
        footer: {
            message: 'MIT License',
            copyright:
                'Copyright © 2018-present <a href="https://noeldemartin.com" target="_blank">Noel De Martin</a>',
        },
        editLink: {
            pattern: 'https://github.com/noeldemartin/soukai/edit/main/docs/:path',
        },
    },
});

function apiSidebar() {
    const apiDir = path.resolve(__dirname, '../api');
    const packages = fs.readdirSync(apiDir).filter((file) => fs.statSync(path.join(apiDir, file)).isDirectory());
    const packagesItems = packages.map((packageName) => {
        const packageDir = path.join(apiDir, packageName);
        const packageBase = `/api/${packageName}/`;
        const categories = fs
            .readdirSync(packageDir)
            .filter((file) => fs.statSync(path.join(packageDir, file)).isDirectory());

        const categoryItems = categories.map((category) => {
            const categoryDir = path.join(packageDir, category);
            const categoryFiles = fs
                .readdirSync(categoryDir)
                .filter((file) => file.endsWith('.md'))
                .map((file) => file.replace('.md', ''));

            return {
                text: stringToTitleCase(category),
                base: `${packageBase}${category}/`,
                collapsed: true,
                items: categoryFiles.map((file) => ({
                    text: file,
                    link: file,
                })),
            };
        });

        return {
            text: packageName,
            base: packageBase,
            link: '/index',
            items: categoryItems,
        };
    });

    return {
        base: '/api/',
        items: [{ text: 'API Reference', link: '/index' }, ...packagesItems],
    };
}
