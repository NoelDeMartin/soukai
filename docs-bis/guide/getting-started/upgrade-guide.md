# Upgrade Guide

::: warning TODO
Write this page. Some breaking changes to cover:

- Properties not declared in the schema are no longer treated as attributes (they behave like normal class properties), and magic properties (relations, computed attributes, timestamps) are read-only.
- Properties assigned in `initialize` must use `declare` without a default value, and the second argument of `initialize` is now an options object instead of the `exists` boolean.
- The `LocalStorageEngine`, `FakeEngine`, and `LogEngine` engines have been removed.
- Filters are no longer supported for retrieving models (field filters, `$contains`, and `$or`), you'll need to filter the results yourself after calling `all()`.
- The `authorizations` relation in Solid models has been removed. Use `fetchPermissions` instead, and read authorizations using `requireWACAuthorizations` (or `requireACPAccessControlResources` for ACP). `isPublic` and `isPrivate` are now methods instead of getters, and they require calling `fetchPermissions` first (`fetchPublicPermissions` has been removed).
- Relations no longer infer foreign key names from model names, so the foreign key must always be declared. Local keys are no longer supported either, related models are always matched using their `url`.
- Attribute getter and setter methods (such as `getNicknameAttribute()` and `setNicknameAttribute(value)`) have been removed. Use native JavaScript getters and setters instead (see [Attribute getters and setters](../core-concepts/models.md#attribute-getters-and-setters)), keeping in mind that these can't override reading or writing real attributes.
- Model configuration that used to be declared with static properties is now declared in the schema. For example, `static timestamps = [TimestampField.CreatedAt]` becomes `timestamps: [TimestampFields.CreatedAt]`, and `static mintsUrls = false` becomes `mintsUrls: false`.
- Field definitions no longer support `get`, `set`, `serialize`, and `deserialize` hooks. Use native JavaScript getters and setters instead of `get` and `set`, and [`rdfCast()`](../advanced/interoperability.md#custom-casts) instead of `serialize` and `deserialize`. Keep in mind that `rdfCast()` works with RDF values, and that array fields receive the entire array. If you were using `deserialize` to validate or normalize values (for example, discarding unknown values), you can use Zod methods such as `.catch()`, `z.preprocess()`, or `.transform()` instead; though these also run when attributes are set, not only when they're read.
- Models no longer have their own engines, so `Model.setEngine()`, `withEngine()`, and `withCollection()` have been removed. Instead, there is a single global engine configured with `setEngine()`, and you can use `runWithEngine()` to run some code using a different one.
- The `ProxyEngine` has also been removed, as well as the `ClosesConnections` interface.
- The `SolidEngine` no longer caches documents, so the `cachesDocuments` and `persistentCache` options have been removed along with the `DocumentsCache` util. Its only options now are `fetch` and `concurrency`.
- The `SolidEngine` listeners (`onDocumentCreated`, `onDocumentRead`, `onDocumentUpdated`, and `onDocumentDeleted`) have been removed. Use [model events](../advanced/observability.md) instead.
- Experimental ActivityPods support has been removed, along with `setExperimentalFlags()`.
- The webpack helpers have been removed, only the Vite helper `getModelsFromViteGlob()` is available.
- `SolidModel.at()` and `SolidModel.from()` have been removed. Use the `from` option instead, for example `Task.at(containerUrl).all()` becomes `Task.all({ from: containerUrl })`.
- Primary keys are no longer configurable (`primaryKey` and `ModelKey` have been removed), all models are identified by their `url`.
- Relation delete strategies are now declared in the schema, using `.onDelete('cascade')` in the relation definition (see [Relations](../core-concepts/relations.md)).
- The `documents` relation in `SolidContainer` has been replaced by the `resources` relation in `Container`.
- `useSoftDeletes()` must now be called on each model instead of globally on `SolidModel`, and only models with history and timestamps can be soft deleted. Soft deletes also create a `crdt:DeleteOperation` now, so they are merged properly on sync. Existing soft deleted models will continue working without changes.
- Some core models and helpers have been renamed: `SolidContainer` is now `Container`, `SolidDocument` and `SolidResource` are now `Resource`, `SolidTypeIndex` is now `TypeIndex`, `SolidTypeRegistration` is now `TypeRegistration`, and `bootSolidModels()` is now `bootCoreModels()`.
:::

::: warning TODO
Review functionality that hasn't been migrated yet, and either implement it or document it as a breaking change above:

- Missing model methods: `clone()`, `unsetAttribute()`, `touch()` (now protected), `wasRecentlyCreated()`, `wasRecentlyDeleted()`, `Model.first()`, `newFromJsonLD()`, and `withoutTimestamps()` (static and instance).
- `createInDocument()` and `saveInDocument()`.
- Malformed attributes handling: `getMalformedDocumentAttributes()` and `fixMalformedAttributes()`.
- `SolidModel.synchronize(a, b)`, for merging two copies of a model manually.
- History helpers: `rebuildAttributesFromHistory()`, `getHistoryHash()`, `withoutTrackingHistory()`, and enabling or disabling history and tombstones at runtime (`enableHistory()`, `disableHistory()`, `enableTombstone()`, `disableTombstone()`).
- Overriding `ignoreRdfPropertyHistory()`.
- Relation methods: `associate()` and `disassociate()` (belongs to one), `remove()` (has one), `clone()`, and `enable()`/`disable()`.
- Errors: `IncompleteDocument`, `ResourceNotFound`, `InvalidModelDefinition`, and `InvalidModelAttributes` (replaced by `InvalidAttributesError`?).
:::
