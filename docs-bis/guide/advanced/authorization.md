# Authorization

In order to manage documents' public permissions, you can use the `fetchPublicPermissions` (or `fetchPublicPermissionsIfMissing`) and `updatePublicPermissions` methods. Once permissions have been fetched, you can also use the `isPublic` and `isPrivate` helpers (they'll return `null` until permissions are fetched):

```js
await movie.fetchPublicPermissions();

console.log(movie.isPublic()); // false

await movie.updatePublicPermissions(['read']);

console.log(movie.isPublic()); // true
```

Available permissions are `read`, `write`, `append`, and `control` (also exported as `SolidDocumentPermissions` from [`@noeldemartin/solid-utils`](https://github.com/NoelDeMartin/solid-utils)).

At the moment, authorization support is limited to [WAC](https://solidproject.org/TR/wac) resources. Authorizations are read and written using the built-in `ACLAuthorization` model.

::: warning TODO
Previous versions of Soukai had a built-in `authorizations` relationship in Solid models to manage document permissions. This hasn't been implemented yet.
:::
