const webpack = require('webpack');
const path = require('path');

const targetBuild = process.env.TARGET_BUILD || 'common';
const inProduction = process.env.NODE_ENV === 'production';

const compilerOptions = {};
const output = {
    path: path.resolve(__dirname, 'dist'),
    library: 'Soukai',
    libraryTarget: 'umd',
    umdNamedDefine: true
};

switch (targetBuild) {
    case 'browser':
        output.filename = 'soukai.js';
        output.libraryTarget = 'window';
        break;
    case 'module':
        output.filename = 'soukai.esm.js';
        compilerOptions.module = 'es6';
        break;
    case 'common':
        output.filename = 'soukai.common.js';
        break;
}

module.exports = {

    entry: path.resolve(__dirname, 'src/index.ts'),

    output,

    module: {

        rules: [

            {
                test: /\.ts$/,
                loader: 'ts-loader',
                options: { compilerOptions },
                exclude: /node_modules/,
            },
        ],

    },

    plugins: [
        new webpack.LoaderOptionsPlugin({ minimize: inProduction }),
    ],

    resolve: {
        extensions: ['*', '.ts'],
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },

};
