# Upgrade Guide

This version of Soukai (`soukai-bis`) is a complete rewrite of the `soukai` and `soukai-solid` packages, and it introduces many breaking changes. This guide will help you upgrade an existing application.

::: warning TODO
Write the upgrade guide. Some of the topics to cover:

- Replacing `soukai` and `soukai-solid` with `soukai-bis` (and installing `zod`).
- Replacing `SolidModel` / `static fields` with `defineSchema` and Zod types, and `FieldType` with Zod equivalents.
- Replacing `bootSolidModels()` with `bootCoreModels()` and `bootModels()`, and importing `soukai-bis/patch-zod`.
- Replacing `rdfsClasses` with `rdfClass`, and `rdfProperty` field options with `.rdfProperty()`.
- Replacing `static collection`, `from()` and `at()` with `defaultContainerUrl`, `all({ from })` and `createAt()`.
- Replacing `...Relationship()` methods with the `relations` option in schemas.
- Replacing `SolidContainer` with `defineContainerSchema`.
- Replacing `new SolidEngine(fetch)` with `new SolidEngine({ fetch })`.
- Replacing `SolidModel.synchronize()` with the `Sync` job.
- Features from previous versions that haven't been implemented yet (marked as **TODO** throughout the guide).
- Compatibility of existing data in Solid PODs (e.g. legacy timestamps).
:::
