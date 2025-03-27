# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- You can now specify `slugField` in model definitions to configure which field will be used to create slugs when [minting urls](./README.md#url-minting).
- Added the ability to update model schemas with `updateSchema`.
- Added the ability to migrate model schemas with `migrateSchema`.

### Changed

- Modernized tooling.
- Creating models from documents with missing required attributes now throws an `IncompleteDocument` error.
- `SolidTypeRegistration.forClass` is now declared as an array.
- Default `rdfContext` resolution changed to prioritize the vocab used in `rdfsClass` if present.
- Matching `rdfsClasses` is not exhaustive anymore. In previous versions, models with multiple classes defined would only be found when all classes were present.
- `SolidEngine` listeners have been refactored, mostly changed naming and refactored the ergonomics.
- `SolidClient` returned values have changed in some methods to include response metadata.

### Deprecated

- Globbing.

### Removed

- Default export.

Also, check [soukai's release notes](https://github.com/NoelDeMartin/soukai/blob/main/CHANGELOG.md) for further changes.

## [v0.5.2](https://github.com/NoelDeMartin/soukai-solid/releases/tag/v0.5.2) - 2023-11-03

### Added

- [#17](https://github.com/NoelDeMartin/soukai-solid/issues/17) Improved utilities to work with the type index, find more in the documentation for [interoperability](./README.md#interoperability).
- `toTurtle` method in `SolidModel`.
- `requireFetch` static method in `SolidModel`.

### Changed

- `SolidContainer.fromTypeIndex` now returns an array of models, rather than a single instance or null.

### Deprecated

- `SolidACLAuthorization.fetch` method has been deprecated, you should use `SolidACLAuthorization.requireFetch` instead.

### Fixed

- Unsetting date values (previously it would write an invalid date instead).

## [v0.5.1](https://github.com/NoelDeMartin/soukai-solid/releases/tag/v0.5.1) - 2023-03-10

### Added

- `cachesDocuments` config option to `SolidEngine` (cache can be cleared calling `clearCache`).

### Fixed

- Saving using latest operation date.
- Tree-shaking by declaring `"sideEffects": false`.

## [v0.5.0](https://github.com/NoelDeMartin/soukai-solid/releases/tag/v0.5.0) - 2023-01-20

This is the first release after 2 years under development, so it's a huge update and the changes listed here are not exhaustive. However, although many of the internals have changed, the public API and core concepts are mostly the same. So upgrading should be mostly straightforward. In any case, you should test that everything is working as expected. And be sure to [ask for assistance](https://github.com/NoelDeMartin/soukai-solid/issues) if you need it!

Also, make sure to check [soukai's release notes](https://github.com/NoelDeMartin/soukai/blob/main/CHANGELOG.md), which also changed significantly.

### Added

- [Authorization helpers](./README.md#authorization) (only for [WAC](https://solidproject.org/TR/wac)).
- [History tracking](./README.md#history-tracking).
- Related models in the same document will be loaded automatically in relationships.
- Inverse relationships will be set automatically.
- New `SolidTypeIndex` and `SolidTypeRegistration` models to help working with [type indexes](https://solid.github.io/type-indexes/).

### Changed

- Upgraded TypeScript to 4.1.
- [Automatic timestamps](./README.md#automatic-timestamps) have been moved to a separate RDF resource, so they'll be accessible from a `metadata` relationship instead of being directly within a model's attributes. Some shortcuts have been implemented such as getters and setters from the parent model, but not everything is backwards compatible.
- Improved container creation algorithm, now it creates parent containers when necessary.
- Attribute casting for empty values (such as undefined, null, or empty arrays) has been improved.
- Renamed `SolidContainerModel` to `SolidContainer`.
- Replaced RDF library dependencies with [@noeldemartin/solid-utils](https://github.com/NoelDeMartin/solid-utils).

### Deprecated

- Globbing. You can continue using it by setting `useGlobbing` to true in `SolidEngine.setConfig`, but it is highly discouraged and it will be removed in future versions.
- The `SoukaiSolid.loadSolidModels` has been deprecated in favour of `bootSolidModels`.

### Removed

- The `MalformedDocumentError` class has been removed in favour of `MalformedSolidDocumentError` from the `@noeldemartin/solid-utils` dependency.

### Fixed

- Creating and updating container metadata, now it requires a separate request.

## [v0.4.2](https://github.com/NoelDeMartin/soukai-solid/releases/tag/v0.4.2) - 2021-03-28

### Fixed

- Relations initialization from JsonLD (models were sometimes duplicated on save).

## [v0.4.1](https://github.com/NoelDeMartin/soukai-solid/releases/tag/v0.4.1) - 2021-01-25

### Changed

- `soukai` dependency has been updated to 0.4.1.
- [#5](https://github.com/NoelDeMartin/soukai-solid/issues/5) `soukai` has been moved to peerDependencies.
- [#6](https://github.com/NoelDeMartin/soukai-solid/issues/6) Fetch types so that it works with different libraries.
- There were some operations specific to [NSS](github.com/solid/node-solid-server) that have been removed.
- SolidDocument models no longer require having any rdf classes.
- `documents` relationship is now initialized empty for new container models.

### Fixed

- Some edge cases creating containers.
- Using collection url on saving fallback.

## [v0.4.0](https://github.com/NoelDeMartin/soukai-solid/releases/tag/v0.4.0) - 2020-11-27

### Added

- Improved error handling with new `MalformedDocumentError` and `NetworkError` classes.
- `SolidEngine` now exposes metadata of the documents it reads through `SolidEngineListener`.
- Added `usingSameDocument` method in `SolidHasManyRelation`.
- Exposed model document info through `getDocumentUrl`, `getSourceDocumentUrl`, etc.

### Changed

- `soukai` dependency has been updated to 0.4.0.
- Refactored the way to store multiple models in a single document. [Read the docs](https://github.com/NoelDeMartin/soukai-solid/tree/v0.4.0#hasmany).
- Improved some internal interactions with the Solid server to use best practices (use describedBy header for containers, remove reserved container properties, and create documents with relative urls instead of absolute).

## [v0.3.0](https://github.com/NoelDeMartin/soukai-solid/releases/tag/v0.3.0) - 2020-07-17

### Added

- New `SolidDocument` model.
- Helper methods in relation instances. [Read the docs](https://github.com/NoelDeMartin/soukai-solid#relations) to learn more.
- `loadSolidModels` method to `SoukaiSolid` instance (the default export of the library). This should be called to load models defined by `soukai-solid`.
- Support for storing multiple models in a single document. [Read the docs](https://github.com/NoelDeMartin/soukai-solid/tree/v0.3.0#hasmany) and see [SolidModel.test.ts](https://github.com/NoelDeMartin/soukai-solid/blob/v0.3.0/src/models/SolidModel.test.ts) for examples.

### Changed

- `soukai` dependency has been updated to 0.3.0.
- Replaced `rdflib` dependency with `jsonld-streaming-parser`, `jsonld-streaming-serializer` and `n3`.
- Extracted container functionality to `SolidContainerModel`, container models should extend this class.
- Refactored engine document format generated by `SolidModel`, they now generate JSON-LD graphs. Data stored with engines other than `SolidEngine` needs to be migrated in the upgrade or the application will stop working. [Read the docs](https://github.com/NoelDeMartin/soukai-solid/tree/v0.3.0#solid-models-vs-solid-documents) for the reasons behind this refactor.
- `SolidModel` class is now abstract (it should always have been).

## [v0.2.1](https://github.com/NoelDeMartin/soukai-solid/releases/tag/v0.2.1) - 2019-12-01

### Fixed

- A bug where using urls of missing resources within a `$in` filter would throw an error.

## [v0.2.0](https://github.com/NoelDeMartin/soukai-solid/releases/tag/v0.2.0) - 2019-08-05

### Added

- Support for features introduced in Soukai 0.2.0 (relationships and filters).
- `resourceUrls` implicit field to containers.
- `mintsUrls` static property on `SolidModel` to disable url minting of new models.

### Changed

- `soukai` dependency has been updated to 0.2.0.
- `solid-auth-client` dependency has been removed, the `SolidEngine` constructor now takes a function to interact with Solid PODs.
- License changed from GPL to MIT ([read this](https://noeldemartin.com/tasks/improving-solid-focus-task-manager#comment-9) to learn why).
- `SolidModel` attributes are now converted to JSON-LD before being sent to engines, this is related with a refactor on Soukai 0.2.0 where models have been decoupled from engines.
- Some methods and arguments have changed, be sure to check out the new [type definitions](https://github.com/NoelDeMartin/soukai-solid/tree/v0.2.0/types).

## [v0.1.0](https://github.com/NoelDeMartin/soukai-solid/releases/tag/v0.1.0) - 2019-03-23

### Added

- Everything!
