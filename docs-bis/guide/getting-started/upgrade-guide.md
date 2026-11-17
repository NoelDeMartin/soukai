# Upgrade Guide

::: warning TODO
Write this page. Some breaking changes to cover:

- Properties not declared in the schema are no longer treated as attributes (they behave like normal class properties), and magic properties (relations, computed attributes, timestamps) are read-only.
- Properties assigned in `initialize` must use `declare` without a default value, and the second argument of `initialize` is now an options object instead of the `exists` boolean.
- The `LocalStorageEngine`, `FakeEngine`, and `LogEngine` engines have been removed.
- Filters are no longer supported for retrieving models (field filters, `$contains`, and `$or`), you'll need to filter the results yourself after calling `all()`.
- The `authorizations` relation in Solid models has been removed. Use `fetchPermissions` instead, and read authorizations using `requireWACAuthorizations` (or `requireACPAccessControlResources` for ACP). `isPublic` and `isPrivate` are now methods instead of getters, and they require calling `fetchPermissions` first (`fetchPublicPermissions` has been removed).
- Relations no longer infer foreign key names from model names, so the foreign key must always be declared. Local keys are no longer supported either, related models are always matched using their `url`.
:::
