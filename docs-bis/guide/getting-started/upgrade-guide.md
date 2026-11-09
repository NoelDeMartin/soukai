# Upgrade Guide

::: warning TODO
Write this page. Some breaking changes to cover:

- Properties not declared in the schema are no longer treated as attributes (they behave like normal class properties), and magic properties (relations, computed attributes, timestamps) are read-only.
- Properties assigned in `initialize` must use `declare` without a default value, and the second argument of `initialize` is now an options object instead of the `exists` boolean.
:::
