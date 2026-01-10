import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid({
    srcDir: 'docs',
    title: 'Soukai',
    description: 'An RDF-first Solid ORM',
    themeConfig: {
        nav: [{ text: 'Guide', link: '/guide' }],
        sidebar: [
            {
                text: 'Guide',
                items: [{ text: 'CRDTs', link: '/guide/crdts' }],
            },
        ],
        socialLinks: [{ icon: 'github', link: 'https://github.com/NoelDeMartin/soukai' }],
    },
});
