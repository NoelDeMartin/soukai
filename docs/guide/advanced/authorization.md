# Authorization

> [!Note]
> This is functionality is limited to applications using the [Solid Protocol](../solid-protocol/what-is-solid.md).

In order to manage documents' permissions, you can take advantage of the built-in `authorizations` relationship. There are also some helpers such as `isPublic` and `isPrivate` getters, and the `fetchPublicPermissions` and `updatePublicPermissions` methods.

At the moment, authorization support is limited to [WAC](https://solidproject.org/TR/wac) resources.
