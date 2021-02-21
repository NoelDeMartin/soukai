const { compilerOptions } = require('../tsconfig.json');
const { Extractor, ExtractorConfig } = require('@microsoft/api-extractor');
const { resolve } = require('path');
const fs = require('fs');
const rollup = require('rollup');
const typescript = require('@rollup/plugin-typescript');
const projectPath = path => resolve(__dirname, '../', path);

async function main() {
    await usingTmp(async () => {
        await generateDeclarations();
        await rollupGeneratedDeclarations();
        await publishDeclarations();
    });

    console.log('Done!');
}

async function usingTmp(callback) {
    clearTmp();
    await callback();
    clearTmp();
}

function clearTmp() {
    if (!fs.existsSync(projectPath('tmp')))
        return;

    fs.rmdirSync(projectPath('tmp'), { recursive: true });
}

async function generateDeclarations() {
    console.log('Generating declarations...');

    const aliases = prepareAliases();
    const bundle = await rollup.rollup({
        input: projectPath('src/main.ts'),
        external: [
            '@noeldemartin/utils',
            'idb',
        ],
        plugins: [
            typescript({
                rootDir: 'src',
                declaration: true,
                outDir: 'tmp',
            }),
        ],
    });

    await bundle.write({ dir: projectPath('tmp') });

    rewriteAliasesInDirectory(projectPath('tmp'), aliases);
}

function prepareAliases() {
    return Object.entries(compilerOptions.paths).map(([alias, paths]) => [
        new RegExp('([\'"])' + alias.slice(0, -2), 'mg'),
        '$1' + projectPath(`tmp/${paths[0]}`).slice(0, -2),
    ]);
}

function rewriteAliasesInDirectory(directoryPath, aliases) {
    const fileNames = fs.readdirSync(directoryPath);

    for (const fileName of fileNames) {
        const filePath = resolve(directoryPath, fileName);
        const fileStats = fs.lstatSync(filePath);

        fileStats.isDirectory()
            ? rewriteAliasesInDirectory(filePath, aliases)
            : rewriteAliasesInFile(filePath, aliases);
    }
}

function rewriteAliasesInFile(filePath, aliases) {
    let contents = fs.readFileSync(filePath).toString();

    for (const [alias, replacement] of aliases) {
        contents = contents.replace(alias, replacement);
    }

    fs.writeFileSync(filePath, contents);
}

async function rollupGeneratedDeclarations() {
    console.log('Rolling up generated declarations...');

    const extractorConfig = ExtractorConfig.loadFileAndPrepare(projectPath('api-extractor.json'));

    Extractor.invoke(extractorConfig, {
        localBuild: process.env.NODE_ENV !== 'production',
        showVerboseMessages: true,
    });
}

async function publishDeclarations() {
    console.log('Moving declarations to dist folder...');

    fs.renameSync(
        projectPath('tmp/soukai.d.ts'),
        projectPath('dist/soukai.d.ts'),
    );
}

main();
