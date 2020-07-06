# Changelog

## v0.3.0

- Added `IndexedDBEngine` engine.
- A Bunch of new operators for filtering and updating have been added to engines. [Read the docs](https://soukai.js.org/guide/using-models.html#using-filters) and see [EngineHelper.test.ts](https://github.com/NoelDeMartin/soukai/blob/v0.3.0/src/engines/EngineHelper.test.ts) for examples.

### Breaking changes

- `Soukai.withEngine` has been removed in favor of `Soukai.requireEngine`.
- Some method signatures have changed in the `Engine` interface. Check out those changes [here](https://github.com/NoelDeMartin/soukai/compare/v0.2.0...v0.3.0#diff-a1932e76d8e479b1bf3926275e2700b0R54-R66).
- Model relations have been refactored to better reflect the nature of non-relational databases. Related model instances are now stored in the Relation instance, which is exposed in `{relation-name}Relation`. Relation definitions have also been renamed to use local/foreign nomenclature. [Read the docs](https://soukai.js.org/guide/defining-models.html#relationships) and see [relations.test.ts](https://github.com/NoelDeMartin/soukai/blob/v0.3.0/src/models/relations/relations.test.ts) for examples.
- Models hydration has been extracted and refactored into multiple protected methods: `createFromEngineDocument`, `toEngineDocument`, `getDirtyEngineDocumentUpdates`, `syncDirty`, `cleanDirty`, etc.

[Compare changes with previous version](https://github.com/NoelDeMartin/soukai/compare/v0.2.0...v0.3.0)

## v0.2.0

- Added filters for reading data.
- Added LocalStorageEngine and EngineHelper.
- Added relationships.
- Added `classFields` attribute to model

### Breaking changes

- Engines have been refactored to know nothing about the models, they'll only get attributes now. Multiple methods have been modified and added to the Model class in order to control attributes serialization.
- InMemoryEngine database format has been changed.
- Some methods and its arguments have changed, be sure to check out new [type definitions](https://github.com/NoelDeMartin/soukai/tree/v0.2.0/types).

[Compare changes with previous version](https://github.com/NoelDeMartin/soukai/compare/v0.1.0...v0.2.0)

## v0.1.0

- Implemented support for attribute accessors.
- Fixed bugs.

### Breaking changes

- Refactored types (Database removed, constructors fixed, etc.).
- Converted attribute names to camelCase (created_at -> createdAt, updated_at -> updatedAt, ...).

[Compare changes with previous version](https://github.com/NoelDeMartin/soukai/compare/v0.0.1...v0.1.0)

## v0.0.1

- First released version.
