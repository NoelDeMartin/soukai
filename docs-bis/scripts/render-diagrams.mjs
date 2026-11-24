import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { run } from '@mermaid-js/mermaid-cli';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcesDir = join(root, 'diagrams');
const outputDir = join(root, 'public', 'diagrams');
const browserExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH ?? findSystemChromium();
const themes = [
    {
        suffix: '',
        theme: 'default',
        themeVariables: { edgeLabelBackground: '#e8e8e8' },
        startColor: '#333333',
    },
    {
        suffix: '-dark',
        theme: 'dark',
        themeVariables: {},
        startColor: '#cccccc',
    },
];
const flowchart = { padding: 8, wrappingWidth: 400, minNodeWidth: 90 };
const removeShadowsCSS = '* { filter: none !important; }';
const edgeLabelsPaddingCSS = '.edgeLabel p { padding: 4px 10px; border-radius: 4px; }';
const smallerDiamondsCSS = '.node .label div { line-height: 1.2 !important; }';
const filter = process.argv[2];
const sources = (await readdir(sourcesDir))
    .filter((file) => file.endsWith('.mmd'))
    .filter((file) => !filter || file.includes(filter));

function findSystemChromium() {
    return ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find((path) =>
        existsSync(path),
    );
}

function getThemeCSS(startColor) {
    const startNodeCSS = `.state-start { fill: ${startColor} !important; stroke: ${startColor} !important; }`;

    return [removeShadowsCSS, edgeLabelsPaddingCSS, smallerDiamondsCSS, startNodeCSS].join(' ');
}

await mkdir(outputDir, { recursive: true });

for (const source of sources) {
    const name = basename(source, '.mmd');

    for (const { suffix, theme, themeVariables, startColor } of themes) {
        const output = join(outputDir, `${name}${suffix}.svg`);

        await run(join(sourcesDir, source), output, {
            quiet: true,
            puppeteerConfig: {
                executablePath: browserExecutablePath,
                headless: true,
                args: process.env.CI ? ['--no-sandbox'] : [],
            },
            parseMMDOptions: {
                backgroundColor: 'transparent',
                mermaidConfig: {
                    theme,
                    flowchart,
                    themeCSS: getThemeCSS(startColor),
                    themeVariables: { ...themeVariables, useGradient: false },
                },
            },
        });

        // oxlint-disable-next-line no-console
        console.log(`Rendered ${output.replace(`${root}/`, '')}`);
    }
}
