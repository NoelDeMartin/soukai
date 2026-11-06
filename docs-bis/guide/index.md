# Introduction

Soukai is an [Active Record](https://en.wikipedia.org/wiki/Active_record_pattern) library made for the [Solid Protocol](./solid-protocol/what-is-solid.md).

Here are some of the main reasons to use it:

- **RDF made easy:** Define your own data shapes using [Zod](https://zod.dev/) with [model schemas](./core-concepts/models.md), and decide how fields are mapped into RDF properties. No need to fiddle with RDF!
- **Decouple logic from storage:** Write code that is independent from storage, and use different [engines](./core-concepts/engines.md) at runtime to configure how the data is persisted: in memory, in the browser storage, or in a Solid POD.
- **Framework agnostic:** Soukai is written in pure JavaScript, you'll be able to use it with your favorite framework (it also works in the backend!).
- **Built on standards:** With the Solid Protocol at its core, it also supports other specifications from the ecosystem; such as [Type Indexes for interoperability](./advanced/interoperability.md#type-indexes), or [WAC/ACP for managing permissions](./advanced/authorization.md).
- **Local-first:** History tracking and conflict resolution are built right into the library with [a CRDT tailored to the Solid Protocol](./advanced/local-first.md).
