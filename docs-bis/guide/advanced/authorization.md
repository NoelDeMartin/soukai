# Authorization

In Solid, document permissions can be managed with two different protocols: [WAC (Web Access Control)](https://solidproject.org/TR/wac) and [ACP (Access Control Policy)](https://solidproject.org/TR/acp). Which one is used depends on the POD, and Soukai supports both.

## Fetching permissions

Before reading or updating permissions, you'll need to fetch them calling the `fetchPermissions` method (or `fetchPermissionsIfMissing`, if you don't want to fetch them again). This will also detect the protocol used by the document, which you can check with the `usesWAC` and `usesACP` helpers:

```ts
await movie.fetchPermissions();

console.log(movie.usesWAC()); // true
console.log(movie.usesACP()); // false
```

All of these helpers (and the ones you'll see below) will throw an error if permissions haven't been fetched yet.

> [!NOTE]
> The detected protocol is remembered for each origin, so that subsequent requests to the same POD don't need to detect it again.

## Public permissions

Once permissions have been fetched, you can use the `isPublic` and `isPrivate` helpers to check whether a document is public, and `requirePublicPermissions` to get the list of public permissions. You can also update them using the `updatePublicPermissions` method:

```ts
await movie.fetchPermissions();

console.log(movie.isPublic()); // false

await movie.updatePublicPermissions(['read']);

console.log(movie.isPublic()); // true
```

Available permissions are `read`, `write`, `append`, and `control` (also exported as `SolidDocumentPermissions` from [`@noeldemartin/solid-utils`](https://github.com/NoelDeMartin/solid-utils)).

Public permissions are read from the `WAC-Allow` header returned by the POD, so they're available with both protocols (as long as the server includes the header). However, `updatePublicPermissions` only supports WAC at the moment. Under the hood, authorizations are read and written using the built-in `ACLAuthorization` model.

## Access Control Policies

When a document uses ACP, its permissions are stored in an Access Control Resource (ACR). Soukai comes with some built-in models to work with ACRs: `ACPAccessControlResource`, `ACPAccessControl`, `ACPPolicy`, and `ACPMatcher`.

After fetching permissions, you can get the existing access control resources using `requireACPAccessControlResources`, or create a new one with `newACPAccessControlResource`. For example, here's how you'd give read access to another user:

```ts
import { ACPAccessControl, ACPMatcher, ACPPolicy } from 'soukai-bis';

await movie.fetchPermissions();

if (movie.usesACP()) {
    const [accessControlResource = movie.newACPAccessControlResource()] = movie.requireACPAccessControlResources();
    const accessControl = new ACPAccessControl();
    const policy = new ACPPolicy({ allow: ['http://www.w3.org/ns/auth/acl#Read'] });

    policy.relatedAnyOfMatchers.attach(new ACPMatcher({ agents: ['https://bob.example.org/profile/card#me'] }));
    accessControl.relatedPolicies.attach(policy);
    accessControlResource.relatedAccessControls.attach(accessControl);

    await accessControlResource.save();
}
```

Access controls attached with `relatedMemberAccessControls` will also apply to the resources inside a container, and you can remove existing access controls using the `removeAccessControl` method (which also deletes policies and matchers that aren't used anymore).

### Custom access controls

If you want to store your own data in access controls, you can extend the `ACPAccessControl` model and pass it to `fetchPermissions` using the `accessControlClass` option. Access controls will be read using your model whenever they match all of its RDF classes:

```ts [Grant.schema.ts]
import { ACPAccessControl, defineSchema } from 'soukai-bis';
import { date } from 'zod';

export default defineSchema(ACPAccessControl, {
    rdfContexts: {
        acp: 'http://www.w3.org/ns/solid/acp#',
        dct: 'http://purl.org/dc/terms/',
        ex: 'https://example.org/vocab#',
    },
    rdfClasses: ['acp:AccessControl', 'ex:Grant'],
    fields: {
        createdAt: date().rdfProperty('dct:created'),
    },
});
```

```ts
await movie.fetchPermissions({ accessControlClass: Grant });
```

> [!WARNING] ⚠️ Blank nodes are read-only
> ACRs often contain policies and matchers declared as blank nodes. Those will be read normally, but trying to update them will throw an error.

::: warning TODO
Previous versions of Soukai had a built-in `authorizations` relation in Solid models to manage document permissions. This hasn't been implemented yet.
:::
