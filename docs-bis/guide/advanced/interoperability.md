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

A registration only matches a model if it includes all of the model's RDF classes (it can include more). Unless they were declared with [`anyOf()`](../core-concepts/models.md#rdf-classes), in which case including any of them is enough. When you register a model, the registration will be created with all of its RDF classes either way.

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

### User profiles

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

As we have seen, Soukai already decouples Model functionality from the data shape by defining the schema in a separate file:

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
    rdfContext: 'https://schema.org/',
    rdfClass: 'Action',
    fields: {
        name: string(),
        completedAt: date().rdfProperty('endTime').nullable().optional(),
    },
});
```

:::

Another feature that helps interoperability is the ability to swap schemas at runtime:

::: code-group

```ts [main.ts]
import ICalSchema from './Task.ical.schema';

Task.updateSchema(ICalSchema);
```

```ts [Task.ical.schema.ts]
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

This can be used to support different vocabularies, and adapt to the one existing data is using; or allow to change it with user preferences.

Updating the schema will change the RDF declarations and mapping: the fields and Zod schema, RDF classes, RDF properties, the default resource hash, and hooks. Other aspects of the model don't change between schemas, so it's not necessary to redeclare things like relations or metadata settings like `timestamps` or `history`.

### Hooks

Some logic may only make sense for a given schema. For example, schema.org's Action has an `actionStatus` property that iCalendar Vtodo doesn't need (because it's derived from the completion date). You can implement that logic using `hooks`:

```ts [Task.schema.ts]
import { defineSchema } from 'soukai-bis';
import { date, string } from 'zod';

export const STATUS_COMPLETED = 'https://schema.org/CompletedActionStatus';
export const STATUS_POTENTIAL = 'https://schema.org/PotentialActionStatus';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'Action',
    fields: {
        name: string(),
        description: string().optional(),
        status: string().rdfProperty('actionStatus').optional(),
        completedAt: date().rdfProperty('endTime').nullable().optional(),
    },
    hooks: {
        beforeInitialize(attributes) {
            attributes.name ??= attributes.description;
        },
        beforeSave() {
            this.status = this.completedAt ? STATUS_COMPLETED : STATUS_POTENTIAL;
        },
    },
});
```

The `beforeInitialize` hook runs when a model is instantiated, before its attributes are validated. It receives the raw attributes, which it can change in place; so it can be used to fill in values that are missing in existing data. When the model is created from RDF, it also receives the statements it's being created from as `quads`, in case you need to read properties that aren't declared in the schema.

The values set by `beforeInitialize` in existing models are not considered changes, so the model won't be dirty after loading and these values won't be written until the attributes are edited.

The `beforeSave` hook runs before saving a model, with the model instance bound as `this`. It runs for every model that is being saved in the same document, not only the one where `save()` was called, and it can return a promise. Any changes made in this hook will be saved along with the rest, and recorded in the same [history](./local-first.md#history-tracking) operations.

Hooks are merged when a schema extends another one, and they are swapped when calling `updateSchema()`; so updating to a schema without hooks will disable them.

### Multiple vocabularies

Swapping schemas works if you know which vocabulary the data is using, but you may also want to [support multiple vocabularies at once](https://www.w3.org/DesignIssues/BagOfChips.html).

To do that, you can use Soukai's ability to declare multiple RDF classes with `anyOf()` and multiple RDF properties with `rdfProperties()`:

```ts [Task.schema.ts]
import { anyOf, defineSchema } from 'soukai-bis';
import { date, string } from 'zod';

export default defineSchema({
    rdfContexts: {
        default: 'https://schema.org/',
        ical: 'http://www.w3.org/2002/12/cal/ical#',
    },
    rdfClasses: anyOf(['Action', 'ical:Vtodo']),
    fields: {
        name: string().rdfProperties(['name', 'ical:summary']),
        completedAt: date().rdfProperties(['endTime', 'ical:completed']).nullable().optional(),
    },
});
```

With this schema, resources with either of the classes will be read as tasks, and each field will be read from the first of its properties that has a value (you can learn more about how this works in the [RDF classes](../core-concepts/models.md#rdf-classes) and [RDF properties](../core-concepts/models.md#rdf-properties) sections). When a field is updated, its value is written to all of its properties; and if the model has [history](./local-first.md#history-tracking) enabled, each of them gets its own operation.

Existing resources are not upgraded until they are edited. For example, if a task only has the `ical:Vtodo` class and the `ical:summary` property, saving it won't add the `schema:Action` class or the `schema:name` property; but `schema:name` will be written the next time the name is updated. The same happens if the properties have different values: the value of the first one is used, and the others will be overridden once the field is updated.

::: warning
Matching resources with any of the classes means that you'll read data written by other applications, which may not have all the fields you need. If a matched resource fails validation, an `InvalidAttributesError` will be thrown. Make sure that required fields have a property in every vocabulary you're reading, or fill them in with a [`beforeInitialize` hook](#hooks).
:::

### Migrations

Reading data in different vocabularies is usually enough, but sometimes you'll want to rewrite existing data to a new schema. For example, to replace a legacy vocabulary, or to change the resource hash of your models.

You can do this using `migrateSchema()`:

```ts
await task.migrateSchema(TaskICalSchema);
```

This rewrites the model's document in place, but doesn't change the schema of the `Task` class (you can update it with `updateSchema` after the migration). Values that only exist in the new schema can be filled in with [hooks](#hooks), which run during the migration as well.

Migrating a model changes the following:

- **Resource url:** if the new schema has a different `rdfDefaultResourceHash`, the resource is renamed. Other documents that reference the old url aren't updated, so you should be careful when you're doing this.
- **Classes and properties:** the classes and properties of the old schema are replaced with the ones of the new schema. Fields are matched by name, so the values of fields that don't exist in the new schema are deleted.
- **Unknown data:** classes and properties that the old schema didn't declare are kept, given that they were probably added by other applications. If the new schema declares some of them, they'll be read into its fields.
- **History:** if the model has [history](./local-first.md#history-tracking) enabled, existing operations are updated to the new url and properties; and the ones for deleted fields are removed. New operations are added for the values that their history doesn't describe yet, for example new fields. The `updatedAt` date doesn't change, and new operations use it as their date.

Operation urls are derived from their contents, so migrating the local and remote copies of a model separately produces the same document, and [synchronizing](./local-first.md#synchronization) them afterwards won't find any differences. A local-first application could migrate its data like this:

```ts
import { remote } from 'soukai-bis';

for (const task of await Task.all()) {
    const remoteTask = await remote(Task).find(task.url);

    await remoteTask?.migrateSchema(TaskICalSchema);
    await task.migrateSchema(TaskICalSchema);
}

Task.updateSchema(TaskICalSchema);
```

::: warning
Migrating data with a `SolidEngine` modifies the data in the POD, which other applications may be using. Because of this, you should make sure that you aren't breaking any existing workflows and any migration should probably be confirmed with users. Also, keep in mind that devices that haven't migrated their local data in a local-first context won't work after the migration either, and you should make sure that both datasets are on the same page before syncing.
:::

## RDF prefix aliases

::: warning TODO
Previous versions of Soukai supported reading data that uses different RDF prefixes than the ones declared in the schema (for example, `http://schema.org/` instead of `https://schema.org/`), using `aliasRdfPrefixes`, `usesRdfAliases`, `resetRdfAliases`, and `replaceRdfPrefixes`. This hasn't been implemented yet.
:::
