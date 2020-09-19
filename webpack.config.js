const webpack = require('webpack');
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

const inProduction = process.env.NODE_ENV === 'production';

const compilerOptions = {};
const output = {
    path: path.resolve(__dirname, 'dist'),
    library: 'Soukai Solid',
    libraryTarget: 'umd',
    umdNamedDefine: true
};

switch (process.env.TARGET_BUILD) {
    case 'esmodule':
        output.filename = 'soukai-solid.esm.js';
        compilerOptions.module = 'es6';
        break;
    case 'commonjs':
        output.filename = 'soukai-solid.common.js';
        break;
    case 'umd':
        output.filename = 'soukai-solid.js';
        output.libraryTarget = 'window';
        break;
}

module.exports = {

    entry: path.resolve(__dirname, 'src/index.ts'),

    output,

    externals: [
        'jsonld-streaming-parser',
        'jsonld-streaming-serializer',
        'n3',
        'soukai',
    ],

    module: {

        rules: [

            {
                test: /\.ts$/,
                use: {
                    loader: 'ts-loader',
                    options: {
                        compilerOptions,
                        onlyCompileBundledFiles: true,
                    },
                },
                exclude: /node_modules/,
            },
        ],

    },

    plugins: [
        new webpack.LoaderOptionsPlugin({ minimize: inProduction }),
    ],

    resolve: {
        extensions: ['*', '.ts', '.js'],
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },

    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    keep_classnames: /Error$/,
                    keep_fnames: /Error$/,
                },
            }),
        ],
    },

};
