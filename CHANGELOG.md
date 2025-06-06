# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.6.2](https://github.com/NoelDeMartin/soukai/releases/tag/v0.6.2) - 2025-06-07

### Added

- `afterInitialize` model hook.

### Fixed

- Getting document models with related models without minted urls.

## [v0.6.1](https://github.com/NoelDeMartin/soukai/releases/tag/v0.6.1) - 2025-05-25

### Added

- New field definition settings: `alias`, `get`, `set`, `serialize` and `deserialize`.
- `useSoftDeletes` static method in `SolidModel` to soft-delete models when `delete()` is called. Also added to `forceDelete()` to make sure that a model is deleted either way.
- `InvalidModelAttributes` error when model attributes are invalid, rather than throwing a plain `Error`.
- `getBootedModels` helper.

### Changed

- `getRelatedModels` and `getDocumentModels` have been refactored to improve performance, and this also affected the way in which inverse relations are updated. This shouldn't have any repercussions in user-land, but it may have affected some edge cases.

### Fixed

- Default foreign key names in relations now use the related model's name (they were using the class name instead, which may cause errors at runtime after minification).
- Calling `attach()` on single model relations previously failed when adding a new model, even if the relation was empty.
- Syncing models with history tracking using different engines (in particular, regarding fields that are ignored in some engines like `ldp:contains`).
- `find` method in Solid models wasn't properly using the RDF class to filter.

## [v0.6.0](https://github.com/NoelDeMartin/soukai/releases/tag/v0.6.0) - 2025-03-31

<img src="http://soukai.js.org/img/nlnet.svg" alt="" width="300">

_This release was partially funded by NLNet in the [Solid Data Modules](https://nlnet.nl/project/SolidDataModules/) project._

### Added

- Added the ability to use multiple schemas per Model, and migrate existing data. Read the [docs on Interoperability](https://soukai.js.org/guide/advanced/interoperability.html#model-schemas) to learn more.
- It is now possible to augment the `ModelEvents` interface in order to declare custom emitted events.
- The following model events have been added: `modified`, `relation-loaded`, and `schema-updated`.
- You can now specify `slugField` in model definitions to configure which field will be used to create slugs when [minting urls](./README.md#url-minting).

### Changed

- Modernized tooling, and consolidated `soukai` and `soukai-solid` into monorepo. Both packages are now ESM-only, and have been tested with Node 22+.
- The documentation has also been updated, and has been merged for both packages. Check it out in the new [soukai.js.org](https://soukai.js.org) page.
- Model `static()` method typings have been refactored for better extensibility.
- Model collections are no longer inherited unless they were initialized explicitly.
- `Key` type is now typed as `string | number | Record<string, string | number>` instead of `any`. This avoids accepting values such as `null` or `undefined` as valid keys.
- `ProxyEngine` is no longer an interface but a class that can be extended, you can still use `IProxyEngine` for backwards compatibility but it'll be removed in future versions.
- Creating Solid models from documents with missing required attributes now throws an `IncompleteDocument` error.
- `SolidTypeRegistration.forClass` field is now declared as an array to better reflect possible values in the wild.
- Default `rdfContext` resolution changed to prioritize the vocab used in `rdfsClass` if present. You can still force the default vocab by declaring it as `default` inside of `rdfContexts`.
- Matching `rdfsClasses` in resources is not exhaustive anymore. In previous versions, models with multiple classes defined would only be found when all classes were present. This behaviour is more aligned with the [Bag of chips](https://www.w3.org/DesignIssues/BagOfChips.html) design principle.
- `SolidEngine` listeners have been refactored, they still provide the same functionality but they changed in naming and ergonomics.
- Values returned from some `SolidClient` methods have been changed to include response metadata.

### Deprecated

- Globbing for `SolidEngine`.
- `ModelEvent` and `ModelEventValue` have been deprecated in favour of the `ModelEvents` interface.

### Removed

- Default exports (they were deprecated 2 years ago).

## Previous releases

- Before 0.6.0, each package had its own changelogs:
    - [soukai](./packages/soukai/CHANGELOG.md)
    - [soukai-solid](./packages/soukai-solid/CHANGELOG.md)
