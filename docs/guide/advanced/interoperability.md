# Interoperability

> [!Note]
> This is functionality is limited to applications using the [Solid Protocol](../solid-protocol/what-is-solid.md).

Interoperability is one of the most important aspects of building Solid Applications. If you don't agree, or want to learn more about it, check out this presentation:

<iframe width="560" height="315" src="https://www.youtube.com/embed/KN9OWj_XdkY?si=g4iECttSLSRB5S0O" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

In this page, you can find about some of the tools that come built-in with Soukai to favour interoperability.

## Type Indexes

[Type Indexes](https://solid.github.io/type-indexes/) can be used to find data by shape independent of its location. Solid models come with some methods to read and write type registrations:

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

You should be able to obtain the `typeIndexUrl` reading user profiles, for example using the `fetchLoginUserProfile` helper from [`@noeldemartin/utils`](https://github.com/noelDeMartin/solid-utils). And create them if they don't yet exist:

```js
await SolidTypeIndex.createPublic(userProfile);
await SolidTypeIndex.createPrivate(userProfile);
```

## Model schemas

One of the key aspects to interoperate is juggling different shapes, or schemas.

With Soukai, you can decouple Model functionality from their actual schema:

::: code-group

```js [Task.js]
import Model from './SchemaOrgTask.schema';
// or import Model from './ICalTask.schema';

class Task extends Model {
    isCompleted() {
        return !!this.completedAt;
    }

    async toggle() {
        if (this.isCompleted()) {
            await this.update({ completedAt: null });

            return;
        }

        await this.update({ completedAt: new Date() });
    }
}
```

```js [SchemaOrgTask.schema.js]
export const STATUS_COMPLETED = 'https://schema.org/CompletedActionStatus';
export const STATUS_POTENTIAL = 'https://schema.org/PotentialActionStatus';

export default defineSolidModelSchema({
    rdfContext: 'https://schema.org/',
    rdfsClass: 'Action',
    fields: {
        name: {
            type: FieldType.String,
            required: true,
        },
        completedAt: {
            type: FieldType.Date,
            rdfProperty: 'startTime',
        },
        status: {
            type: FieldType.Key,
            rdfProperty: 'actionStatus',
        },
    },
    hooks: {
        beforeSave() {
            if (this.getAttribute('completedAt')) {
                this.setAttribute('status', STATUS_COMPLETED);

                return;
            }

            this.setAttribute('status', STATUS_POTENTIAL);
        },
    },
});
```

```js [ICalTask.schema.js]
export default defineSolidModelSchema({
    rdfContext: 'http://www.w3.org/2002/12/cal/ical#',
    rdfsClass: 'Vtodo',
    fields: {
        name: {
            type: FieldType.String,
            required: true,
            rdfProperty: 'summary',
        },
        completedAt: {
            type: FieldType.Date,
            rdfProperty: 'completed',
        },
    },
});
```

:::

Then, at runtime, you can swap schemas depending on user preferences or existing data:

```js
import ICalTaskSchema from './ICalTask.schema';

await Task.updateSchema(ICalTaskSchema);
```

Notice how you can also implement logic that is specific to a given schema, using the `hooks` property to run code in lifecycle events such as `beforeSave` or `afterSave`.

You may also find that you want to [support multiple schemas at once](https://www.w3.org/DesignIssues/BagOfChips.html), given that not all applications will be as flexible. To do that, you can declare multiple RDF classes and use the `alias` attribute in fields:

```js
export const STATUS_COMPLETED = 'https://schema.org/CompletedActionStatus';
export const STATUS_POTENTIAL = 'https://schema.org/PotentialActionStatus';

export default defineSolidModelSchema({
    rdfContexts: {
        default: 'https://schema.org/',
        ical: 'http://www.w3.org/2002/12/cal/ical#',
    },
    rdfsClasses: ['Action', 'ical:Vtodo'],
    fields: {
        name: {
            type: FieldType.String,
            required: true,
            alias: '_icalName',
        },
        completedAt: {
            type: FieldType.Date,
            rdfProperty: 'startTime',
            alias: '_icalCompletedAt',
        },
        status: {
            type: FieldType.Key,
            rdfProperty: 'actionStatus',
        },
        _icalName: {
            type: FieldType.String,
            rdfProperty: 'ical:summary',
        },
        _icalCompletedAt: {
            type: FieldType.Date,
            rdfProperty: 'ical:completed',
        },
    },
    hooks: {
        beforeSave() {
            if (this.getAttribute('completedAt')) {
                this.setAttribute('status', STATUS_COMPLETED);

                return;
            }

            this.setAttribute('status', STATUS_POTENTIAL);
        },
    },
});
```

Finally, you can migrate existing data using the `migrateSchema` method. Keep in mind that if you're using a `SolidEngine` this will, indeed, modify the data written in the POD that other applications may be using. Make sure that you aren't breaking any existing workflows.

```js
const icalTask = await schemaOrgTask.updateSchema(ICalTaskSchema);
```

## RDF prefix aliases

There are some situations where an RDF prefix may be written differently by other applications. For example, there are still some problems about [using http or https for schema.org](https://github.com/solid/solid-namespace/issues/21).

In order to support both, you can use the `aliasRdfPrefixes` method:

```js
Task.aliasRdfPrefixes({ 'http://schema.org/': 'https://schema.org/' });
```
