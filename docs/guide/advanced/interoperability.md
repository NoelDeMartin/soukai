# Interoperability

> [!Note]
> This is functionality is limited to applications using the [Solid Protocol](../solid-protocol/what-is-solid.md).

In order to improve interoperability between apps, you can make use of [Type Indexes](https://solid.github.io/type-indexes/). There are some utilities built in the library to read and write type registrations:

```js
// Read containers and documents registered in the type index
const movieContainers = await SolidContainer.fromTypeIndex(typeIndexUrl, Movie);
const movieDocuments = await SolidDocument.fromTypeIndex(typeIndexUrl, Movie);

// Register documents in the type index
await movie.registerInTypeIndex(typeIndexUrl);

// Register containers in the type index
const movies = new SolidContainer({ url: moviesContainerUrl });

await movies.register(typeIndexUrl, Movie);
```

You should be able to obtain the `typeIndexUrl` from user profiles, and in case they don't exist you can create them as well:

```js
await SolidTypeIndex.createPublic(userProfile);
await SolidTypeIndex.createPrivate(userProfile);
```
