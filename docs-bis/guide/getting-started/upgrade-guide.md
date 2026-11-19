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
:::
