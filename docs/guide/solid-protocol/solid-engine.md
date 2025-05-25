# Solid Engine

If you're going to work with Solid, you'll need to use a `SolidEngine` to communicate with the POD. For the most part, it works the same way as any other engines; but it does have some small differences.

As mentioned in the [Models vs Documents](./solid-models.md#models-vs-documents) section, Solid models and documents are not an exact one-to-one mapping as it happens with other models. However, this shouldn't affect an engine, because engines work directly with documents (if you look at their interface, you'll notice they don't reference the `Model` class anywhere).

But this affects some implementation details, and if you decide to source-dive into the library, you'll notice that in some instances models are checking whether the engine they're talking with is a SolidEngine or not. For that same reason, it's not possible to use a non-Solid model to communicate with a `SolidEngine`.

Here's some of the differences:

## Only accepts JSON-LD graph updates

The way in which this impedance mismatch is resolved is that Solid Models are serialized to JSON-LD graphs, where each resource is isolated from the others inside an array:

::: code-group

```json [Engine document]
{
    "@graph": [
        {
            "@context": { "@vocab": "https://schema.org/" },
            "@id": "https://example.org/movies/blue-giant#it",
            "@type": ["Movie"],
            "name": "Blue Giant"
        },
        {
            "@context": { "@vocab": "https://schema.org/" },
            "@id": "https://example.org/movies/blue-giant#watched",
            "@type": "WatchAction",
            "object": { "@id": "https://example.org/movies/blue-griant#it" },
            "startTime": { "@type": "http://www.w3.org/2001/XMLSchema#dateTime", "@value": "2025-05-11T15:09:40Z" }
        }
    ]
}
```

```js [JS Code]
class Movie extends SolidModel {
    static rdfContext = 'https://schema.org/';
    static rdfsClass = 'Movie';
    static timestamps = false;
    static fields = {
        name: FieldType.String,
    };

    relatedWatchAction() {
        return this.hasOne(WatchAction, 'object');
    }
}

class WatchAction extends SolidModel {
    static rdfContext = 'https://schema.org/';
    static rdfsClass = 'WatchAction';
    static timestamps = false;
    static fields = {
        object: FieldType.Key,
        startTime: FieldType.Date,
    };
}

bootSolidModels();
setEngine(new SolidEngine());

const movie = await Movie.create({ name: 'Blue Giant' });

await movie.relatedWatchAction.create({ startTime: new Date() });
```

:::

This way, the models can work with any other engines (because a JSON-LD graph is just a JSON object); whilst a SolidEngine understands the JSON-LD updates and translates them to network requests against a Solid POD.

However, if you try to send an update to a SolidEngine that doesn't follow this pattern, it will throw an error. This does violate polymorphism and probably a million other rules of Object Oriented programming. But it's a worthy trade-off in order to achieve Soukai's mission: Storage independence.

## The `$in` filter

In other engines, the `$in` filter is used to filter model ids, given that all the models will always be stored in the same collection. But in Solid, it will be used to narrow down which documents to read from. This was implemented in order to handle the fact that models can be spread throughout containers and documents in Solid, so you can potentially do something like this:

```js
Movies.all({
    $in: [
        'https://example.org/movies/anime/blue-giant',
        'https://example.org/movies/action/die-hard',
        'https://example.org/movies/horror/the-substance',
        // ...
    ],
});
```
