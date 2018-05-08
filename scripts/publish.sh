#!/usr/bin/env sh

# abort on errors
set -e

# build
rm -rf dist
npm run build
npm run build-es6
npm run build-umd

# publish
npm publish

cd -
