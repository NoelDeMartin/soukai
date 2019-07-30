# Changelog

## v0.2.0

- Added filters for reading data.
- Added LocalStorageEngine and EngineHelper.
- Added relationships.
- Added `classFields` attribute to model

### Breaking changes

- Engines have been refactored to know nothing about the models, they'll only get attributes now. Multiple methods have been modified and added to the Model class in order to control attributes serialization.
- InMemoryEngine database format has been changed.
- Some methods and its arguments have changed, be sure to check out new [type definitions](https://github.com/NoelDeMartin/soukai/tree/master/types).

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
