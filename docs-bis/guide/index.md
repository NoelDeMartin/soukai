# Introduction

Soukai is an [Active Record](https://en.wikipedia.org/wiki/Active_record_pattern) library for the [Solid Protocol](./solid-protocol/what-is-solid.md). You can use it to declare your data models once, and store them in memory, in the browser, or in a decentralized [Solid POD](./solid-protocol/what-is-solid.md).

These are some of its main features:

- **Decouple logic from storage:** Using the Active Record pattern, you'll be able to write code that is independent from storage. Use [engines](./core-concepts/engines.md) to configure how the data is persisted.
- **Framework agnostic:** Soukai is written in pure JavaScript (and TypeScript), use it with your favorite framework.
- **Built on standards:** All models are RDF resources, so you can make decentralized applications with RDF and Linked Data using the [Solid Protocol](https://solidproject.org).
- **Local-first:** Combining a Solid backend with local engines, you can create [local-first apps](./advanced/local-first.md). With history tracking and conflict resolution built-in thanks to CRDTs.

> [!NOTE]
> This is the documentation for `soukai-bis`, the unified rewrite of `soukai` and `soukai-solid`. Some features from previous versions haven't been implemented yet, and they are marked as **TODO** throughout the guide. If you're upgrading an existing application, check out the [Upgrade Guide](./getting-started/upgrade-guide.md).

Ready to start? Head over to the [Installation](./getting-started/installation.md) guide.
