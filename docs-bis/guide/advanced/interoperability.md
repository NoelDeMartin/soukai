# Interoperability

Interoperability is one of the most important aspects of building Solid Applications. If you don't agree, or want to learn more about it, check out this presentation:

<iframe class="aspect-video w-full" src="https://www.youtube.com/embed/KN9OWj_XdkY?si=g4iECttSLSRB5S0O" title="Interoperable Serendipity" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

In this page, you can find about some of the tools that come built-in with Soukai to favour interoperability.

## Type Indexes

[Type Indexes](https://solid.github.io/type-indexes/) can be used to find data by shape independent of its location. Soukai comes with some built-in models to read and write type registrations:

```ts
import { Container, TypeIndex } from 'soukai-bis';

// Read containers registered in the type index
const movieContainers = await Container.createFromTypeIndex(typeIndexUrl, Movie);

// Find the first container registered for a model
const typeIndex = await TypeIndex.findOrFail(typeIndexUrl);
const moviesContainer = await typeIndex.findContainer(Movie);

// Register containers in the type index
const movies = await Container.createAt(storageUrl, { name: 'Movies' });

await movies.register(typeIndexUrl, Movie);
```

You should be able to obtain the `typeIndexUrl` reading user profiles, for example using the `fetchLoginUserProfile` helper from [`@noeldemartin/solid-utils`](https://github.com/NoelDeMartin/solid-utils). And create them if they don't yet exist:

```ts
await TypeIndex.createPublic(userProfile);
await TypeIndex.createPrivate(userProfile);
```

There is also a built-in `Person` model that can be used to work with user profiles, and find containers registered in any of their type indexes:

```ts
import { Person } from 'soukai-bis';

const user = Person.createFromProfile(userProfile);
const moviesContainer = await user.findRegisteredContainer(Movie);
```

::: warning TODO
Previous versions of Soukai also supported reading documents registered in the type index (`SolidDocument.fromTypeIndex(typeIndexUrl, Movie)`), and registering individual documents (`movie.registerInTypeIndex(typeIndexUrl)`). This hasn't been implemented in the models API yet (although instance registrations are supported when [synchronizing](./local-first.md#synchronization) models).
:::

## Model schemas

One of the key aspects to interoperate is juggling different shapes, or schemas.

With Soukai, you can decouple Model functionality from their actual schema declaring it in a separate file:

::: code-group

```ts [Task.ts]
import Model from './Task.schema';

export default class Task extends Model {
    public isCompleted(): boolean {
        return !!this.completedAt;
    }

    public async toggle(): Promise<void> {
        if (this.isCompleted()) {
            await this.update({ completedAt: null });

            return;
        }

        await this.update({ completedAt: new Date() });
    }
}
```

```ts [Task.schema.ts]
import { defineSchema } from 'soukai-bis';
import { date, string } from 'zod';

export default defineSchema({
    rdfContext: 'http://www.w3.org/2002/12/cal/ical#',
    rdfClass: 'Vtodo',
    fields: {
        name: string().rdfProperty('summary'),
        completedAt: date().rdfProperty('completed').nullable().optional(),
    },
});
```

:::

::: warning TODO
Previous versions of Soukai supported some features to work with multiple schemas that haven't been implemented yet:

- Swapping schemas at runtime, using `Task.updateSchema(OtherSchema)`.
- Running logic specific to a schema with `hooks` (such as `afterInitialize`, `beforeSave`, and `afterSave`).
- [Supporting multiple schemas at once](https://www.w3.org/DesignIssues/BagOfChips.html), using `alias` in fields. Multiple RDF classes can be declared using `rdfClasses`, but resources will only match the model if they have all of them.
- Migrating existing data to a different schema, using `task.migrateSchema(OtherSchema)`.
:::

## RDF prefix aliases

::: warning TODO
Previous versions of Soukai supported reading data that uses different RDF prefixes than the ones declared in the schema (for example, `http://schema.org/` instead of `https://schema.org/`), using `aliasRdfPrefixes`, `usesRdfAliases`, `resetRdfAliases`, and `replaceRdfPrefixes`. This hasn't been implemented yet.
:::
