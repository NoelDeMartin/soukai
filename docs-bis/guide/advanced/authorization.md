# Authorization

In Solid, document permissions can be managed with two different protocols: [WAC (Web Access Control)](https://solidproject.org/TR/wac) and [ACP (Access Control Policy)](https://solidproject.org/TR/acp).

Soukai provides a hybrid API to work with both. Some simple operations are protocol agnostic, but for more complex tasks you'll need to be aware of the authorization scheme.

## Fetching permissions

In order to work with permissions, you'll need to fetch them calling the `fetchPermissions` method (or `fetchPermissionsIfMissing` if you want to reuse previous calls). This will also detect the protocol used by the document, which you can check with the `usesWAC` and `usesACP` helpers:

```ts
await movie.fetchPermissions();

console.log(movie.usesWAC()); // true
console.log(movie.usesACP()); // false
```

Keep in mind that most authorization helpers, such as `usesWAC` or `usesACP`, will throw an error if permissions haven't been fetched yet.

## Public permissions

Once permissions have been fetched, you can use the `isPublic` and `isPrivate` helpers to check whether a document is publicly readable, and `requirePublicPermissions` to get the entire list of public permissions.

You can also update them using the `updatePublicPermissions` method:

```ts
await movie.fetchPermissions();

console.log(movie.isPublic()); // false

await movie.updatePublicPermissions(['read']);

console.log(movie.isPublic()); // true
```

Available permissions are `read`, `write`, `append`, and `control` (also exported as `SolidDocumentPermissions` from [`@noeldemartin/solid-utils`](https://github.com/NoelDeMartin/solid-utils)).

Public permissions are read from the `WAC-Allow` header returned by the POD, which in some implementations is also returned from ACP servers.

However, `updatePublicPermissions` only supports WAC at the moment.

## Web Access Control

When a document uses WAC, its permissions are stored as authorizations in an Access Control List (ACL) document. Soukai reads them using the built-in `ACLAuthorization` model, and you can get them after fetching permissions using `requireWACAuthorizations`.

To give access to other users, you can use the `createWACAuthorization` method:

```ts
await movie.fetchPermissions();

await movie.createWACAuthorization({
    agents: ['https://bob.example.org/profile/card#me'],
    modes: ['http://www.w3.org/ns/auth/acl#Read'],
});
```

When used with containers, new authorizations will also apply to the resources inside of them (using `acl:default`).

Existing authorizations can be modified and deleted like any other model, using methods such as `update` and `delete`.

Documents without their own ACL inherit authorizations from their container. In that case, `requireWACAuthorizations` will return an empty array, and `createWACAuthorization` will create the document ACL copying the inherited authorizations (so that you don't lose access to the document). `updatePublicPermissions` does the same, but only when the inherited public permissions don't match. However, given that inherited public authorizations are replaced in that case, `updatePublicPermissions` will fail if none of the remaining authorizations grant `control` access (to prevent locking everyone out of the document's permissions).

Also keep in mind that reading authorizations requires `control` access.

## Access Control Policies

When a document uses ACP, its permissions are stored in an Access Control Resource (ACR). Soukai comes with some built-in models to work with ACRs: `ACPAccessControlResource`, `ACPAccessControl`, `ACPPolicy`, and `ACPMatcher`.

After fetching permissions, you can get the existing access control resources using `requireACPAccessControlResources`, or create a new one with `newACPAccessControlResource`.

For example, here's how you'd give read access to another user:

```ts
import { ACPAccessControl, ACPMatcher, ACPPolicy } from 'soukai-bis';

await movie.fetchPermissions();

const acrs = movie.requireACPAccessControlResources();
const acr = acrs[0] ?? movie.newACPAccessControlResource();
const accessControl = new ACPAccessControl();
const policy = new ACPPolicy({ allow: ['http://www.w3.org/ns/auth/acl#Read'] });
const matcher = new ACPMatcher({ agents: ['https://bob.example.org/profile/card#me'] });

policy.relatedAnyOfMatchers.attach(matcher);
accessControl.relatedPolicies.attach(policy);
acr.relatedAccessControls.attach(accessControl);

await acr.save();
```

Access controls attached with `relatedMemberAccessControls` will also apply to the resources inside a container, and you can remove existing access controls using the `removeAccessControl` method (which also deletes policies and matchers that aren't used anymore).

### Custom access controls

If you want to store your own data in access controls, you can extend the `ACPAccessControl` model and pass it to `fetchPermissions` using the `accessControlClass` option. Access controls will be read using your model whenever they match all of its RDF classes:

::: code-group

```ts [main.ts]
await movie.fetchPermissions({ accessControlClass: MyGrant });
```

```ts [MyGrant.schema.ts]
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

:::

> [!WARNING] ⚠️ Blank nodes are read-only
> ACRs often contain policies and matchers declared as blank nodes. Those will be read normally, but trying to update them will throw an error given that blank nodes aren't currently supported.
