# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Next

- Renamed `master` branch to `main`, and `dev` to `next`.
- Replaced `tslint` with `eslint`.
- Upgraded TypeScript version to 4.1.

## [v0.4.1](https://github.com/NoelDeMartin/soukai/releases/tag/v0.4.1) - 2021-01-25

### Fixed

- TransactionInactiveError using IndexedDBEngine as reported [here](https://github.com/NoelDeMartin/media-kraken/issues/10).
- The `loaded` property from `Relation` class was readonly but this wasn't specified in the declaration files.

## [v0.4.0](https://github.com/NoelDeMartin/soukai/releases/tag/v0.4.0) - 2020-11-27

### Added

- `$in` filter for individual fields.
- `onDelete` method to relations.
- `wasRecentlyCreated` method to `Model`.

### Changed

- `SoukaiError` now extends properly from the native `Error` class.
- `BelongsToRelation` class has been renamed to `BelongsToOneRelation`, and the `Model` method `belongsTo` to `belongsToOne`.

## [v0.3.0](https://github.com/NoelDeMartin/soukai/releases/tag/v0.3.0) - 2020-07-17

### Added

- `IndexedDBEngine` engine.
- A bunch of new operators for filtering and updating. [Read the docs](https://soukai.js.org/guide/using-models.html#using-filters) and see [EngineHelper.test.ts](https://github.com/NoelDeMartin/soukai/blob/v0.3.0/src/engines/EngineHelper.test.ts) for examples.

### Changed

- `Soukai.withEngine` has been removed in favor of `Soukai.requireEngine`.
- Some method signatures in the `Engine` interface. Check out those changes [here](https://github.com/NoelDeMartin/soukai/compare/v0.2.0...v0.3.0#diff-a1932e76d8e479b1bf3926275e2700b0R54-R66).
- Model relations have been refactored to better reflect the nature of non-relational databases. Related model instances are now stored in the `Relation` instance, which is exposed in `{relation-name}Relation` model properties. Relation definitions have also been renamed to use local/foreign nomenclature. [Read the docs](https://soukai.js.org/guide/defining-models.html#relationships) and see [relations.test.ts](https://github.com/NoelDeMartin/soukai/blob/v0.3.0/src/models/relations/relations.test.ts) for examples.
- Models hydration has been extracted and refactored into multiple protected methods: `createFromEngineDocument`, `toEngineDocument`, `getDirtyEngineDocumentUpdates`, `syncDirty`, `cleanDirty`, etc.

## [v0.2.0](https://github.com/NoelDeMartin/soukai/releases/tag/v0.2.0) - 2019-08-05

### Added

- Filters for reading data.
- `LocalStorageEngine` and `EngineHelper`.
- Relationships.
- `classFields` attribute in `Model`.

### Changed

- Engines have been refactored to know nothing about the models, they'll only get attributes now. Multiple methods have been modified and added to the `Model` class in order to control attributes serialization.
- InMemoryEngine database format has been changed.
- Some methods and its arguments have changed, be sure to check out the new [type definitions](https://github.com/NoelDeMartin/soukai/tree/v0.2.0/types).

## [v0.1.0](https://github.com/NoelDeMartin/soukai/releases/tag/v0.1.0) - 2019-03-23

### Added

- Attribute accessors.
- Polyfills added for CJS (runtime) and UMD (bundled), not with ESM due to https://github.com/zloirock/core-js/issues/385 (and most clients using ESM should already be using modern environments)

### Changed

- Refactored type definitions.
- Converted attribute names to camelCase (created_at -> createdAt, updated_at -> updatedAt, ...).

## [v0.0.1](https://github.com/NoelDeMartin/soukai/releases/tag/v0.0.1) - 2018-05-17

### Added

- Everything!
