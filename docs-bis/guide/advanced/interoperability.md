# Interoperability

Interoperability is one of the most important aspects of building Solid Applications.

If you want to learn more about it, check out this presentation:

<iframe class="aspect-video w-full" src="https://www.youtube.com/embed/KN9OWj_XdkY?si=g4iECttSLSRB5S0O" title="Interoperable Serendipity" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

In this page, you'll find some of the tools that come built-in with Soukai to favour interoperability.

## Type Indexes

[Type Indexes](https://solid.github.io/type-indexes/) can be used to find data of a given type independent of its location.

It can be registered in two ways, with a container registration (declaring that a container has data of the given type) or with instances (declaring individual resources).

### Reading registrations

You can use the built-in `TypeIndex` model to find registrations:

```ts
import { TypeIndex } from 'soukai-bis';

const typeIndex = await TypeIndex.findOrFail(typeIndexUrl);

const registrations = await typeIndex.findRegistrations(Movie);
const containerUrls = await typeIndex.findContainerUrls(Movie);
const containers = await typeIndex.findContainers(Movie);
const instanceUrls = await typeIndex.findInstanceUrls(Movie);
const instances = await typeIndex.findInstances(Movie);
```

A registration only matches a model if it includes **all** of the model's RDF classes (it can include more). When you register a model, the registration will be created with all of its RDF classes as well.

### Creating registrations

As mentioned, you can register containers or individual models. Registrations that already exist won't be duplicated:

```ts
// Register a container for movies
const movies = await Container.createAt(storageUrl, { name: 'Movies' });

await movies.register(typeIndexUrl, Movie);

// Register a single movie
await movie.register(typeIndexUrl);
```

All of these methods take either a type index url or a `TypeIndex` instance. You can also use the `registerContainer` and `registerInstance` methods in the type index directly:

```ts
await typeIndex.registerContainer(movies, Movie);
await typeIndex.registerInstance(movie);
```

### Working with user profiles

In order to obtain the url of the type indexes (private and public), you should read the user profile as described in the [Solid WebID Profile Spec](https://solid.github.io/webid-profile/).

This is implemented in the `fetchLoginUserProfile` helper from [`@noeldemartin/solid-utils`](https://github.com/NoelDeMartin/solid-utils). You can also use the profile returned by that library to create new type indexes:

```ts
const webId = 'https://alice.example/profile/card#me';
const userProfile = await fetchLoginUserProfile(webId);

await TypeIndex.createPublic(userProfile);
await TypeIndex.createPrivate(userProfile);
```

There is also a built-in `Person` model that can be used to work with user profiles, and find containers or instances registered in any of their type indexes:

```ts
const user = Person.createFromProfile(userProfile);
const typeIndexes = await user.findTypeIndexes();
const publicTypeIndexes = await user.findPublicTypeIndexes();
const privateTypeIndexes = await user.findPrivateTypeIndexes();
const movieContainers = await user.findRegisteredContainers(Movie);
const movies = await user.findRegisteredInstances(Movie);
```

Both methods also accept an options object to look only at public or private type indexes, and you can indicate which class to use for containers:

```ts
const publicMovies = await user.findRegisteredInstances(Movie, { registration: 'public' });
const privateMovieContainers = await user.findRegisteredContainers(Movie, {
    registration: 'private',
    containerModelClass: MoviesContainer,
});
```

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

This makes it possible to declare other schemas for the same model, and swap them at runtime depending on user preferences or existing data:

::: code-group

```ts [SchemaOrgTask.schema.ts]
import { defineSchema } from 'soukai-bis';
import { date, string } from 'zod';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'Action',
    fields: {
        name: string(),
        completedAt: date().rdfProperty('endTime').nullable().optional(),
    },
});
```

```ts [main.ts]
import SchemaOrgTaskSchema from './SchemaOrgTask.schema';

Task.updateSchema(SchemaOrgTaskSchema);
```

:::

This replaces the vocabulary of the model: its fields, RDF classes, RDF properties, and default resource hash. Remote models are updated as well, so make sure to call it on `Task` rather than `remote(Task)`.

Other aspects of the model can't change between schemas. Relations, computed attributes, and the `timestamps`, `history`, and `tombstone` flags are kept from the original schema, and `updateSchema()` will throw an error if the new schema uses different flags or declares relations that the model doesn't have. Schemas that don't declare any relations are fine, so you don't need to repeat them. Also, keep in mind that types don't change at runtime, so the new schema should have the same fields as the original.

::: warning TODO
Previous versions of Soukai supported some features to work with multiple schemas that haven't been implemented yet:

- Running logic specific to a schema with `hooks` (such as `afterInitialize`, `beforeSave`, and `afterSave`).
- [Supporting multiple schemas at once](https://www.w3.org/DesignIssues/BagOfChips.html), using `alias` in fields. Multiple RDF classes can be declared using `rdfClasses`, but resources will only match the model if they have all of them.
- Migrating existing data to a different schema, using `task.migrateSchema(OtherSchema)`.
:::

## RDF prefix aliases

::: warning TODO
Previous versions of Soukai supported reading data that uses different RDF prefixes than the ones declared in the schema (for example, `http://schema.org/` instead of `https://schema.org/`), using `aliasRdfPrefixes`, `usesRdfAliases`, `resetRdfAliases`, and `replaceRdfPrefixes`. This hasn't been implemented yet.
:::
