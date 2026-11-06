# What is Solid?

The [Solid Protocol](https://solidproject.org) is a standard for decentralized storage that uses Linked Data and RDF. The data is stored in Solid PODs (Personal Online Datastores), which are servers that users trust with their data. In this sense, Solid Applications are decentralized because they can connect to any backend that supports the protocol. It could be a service from a provider you trust, or a self-hosted computer in your basement.

If you want to learn how it works, you can look at the first 10 minutes of this presentation:

<iframe class="aspect-video w-full" src="https://www.youtube.com/embed/kPzhykRVDuI?si=p2u8CE5qBrnzNs0Z" title="From Zero to Hero with Solid" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

## Soukai and Solid

Working with Solid directly can be challenging. You need to parse and serialize RDF, keep track of which triples have changed in order to send `PATCH` requests, discover where data lives in a POD, and so on. Soukai takes care of all of this, so that you can work with plain JavaScript objects using a familiar Active Record API:

```ts
const movie = await Movie.findOrFail('https://alice.example.org/movies/spirited-away#it');

await movie.update({ title: 'Spirited Away (千と千尋の神隠し)' });
```

Under the hood, the library will read the RDF document, update the model attributes, and send a SPARQL `PATCH` request to the POD with only the triples that have changed.

All models are read from and stored in a Solid POD using the `SolidEngine`, which only needs an authenticated fetch (you can learn how to configure it in the [Configuration](../getting-started/configuration.md#authentication) section). And because every engine stores the same RDF, you can also store your models locally (for example, using the `IndexedDBEngine`) and [synchronize them with a POD](../advanced/local-first.md) to build local-first applications.

There are also some built-in models to work with common Solid resources, such as `Person` (for user profiles), `Container`, `TypeIndex`, and `TypeRegistration`. You can learn more about them in the [Interoperability](../advanced/interoperability.md) section.

## Next steps

Once you're familiar with Solid, make sure to read the [Mental Model](./mental-model.md) section to understand how models map to Solid data. You can also check out some examples, such as the [Hello World (using Solid)](../examples/hello-world-using-solid.md) or the [Tasks Manager](../examples/tasks-manager.md).
