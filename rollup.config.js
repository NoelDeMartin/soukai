import { babel } from '@rollup/plugin-babel';
import { terser } from 'rollup-plugin-terser';
import typescript from '@rollup/plugin-typescript';

import { browser, module, main } from './package.json';

function build(output, bundlePolyfills = false) {
    const extensions = ['.ts'];

    return {
        input: 'src/main.ts',
        output: {
            sourcemap: true,
            exports: 'named',
            globals: {
                '@noeldemartin/utils': 'NoelDeMartin_Utils',
                'idb': 'idb',
            },
            ...output,
        },
        external: [
            '@noeldemartin/utils',
            'idb',
            ...(bundlePolyfills ? [] : [/^@babel\/runtime\//, /^core-js\//]),
        ],
        plugins: [
            typescript(),
            babel({
                extensions,
                babelHelpers: bundlePolyfills ? 'bundled' : 'runtime',
                plugins: [
                    '@babel/plugin-proposal-class-properties',
                    ...(bundlePolyfills ? [] : ['@babel/plugin-transform-runtime']),
                ],
                presets: [
                    '@babel/preset-typescript',
                    [
                        '@babel/preset-env',
                        {
                            targets: '> 0.5%, last 2 versions, Firefox ESR, not dead',
                            corejs: { version: '3.8', proposals: true },
                            useBuiltIns: 'usage',
                        },
                    ],
                ],
            }),
            terser({
                keep_classnames: /Error$/,
                keep_fnames: /Error$/,
            }),
        ],
    };
}

export default [
    build({ file: module, format: 'esm' }),
    build({ file: main, format: 'cjs' }),
    build({ file: browser, format: 'umd', name: 'Soukai' }, true),
];
