#!/usr/bin/env sh

REPO_URL=`git remote get-url origin`

# abort on errors
set -e

# build
npm run docs:build-vuepress
npm run docs:build-typedoc

# navigate into the build output directory
cd docs/.vuepress/dist

# setup js.org config
echo "soukai.js.org" > CNAME

# create repository
git init
git add -A
git commit -m 'deploy'

# push updates
git push $REPO_URL master:gh-pages --force

cd -
