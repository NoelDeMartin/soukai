# Relations

When you start using this library, you should be able to get by only with models and engines. But often, you'll find that models link to other; and keeping track of the relations and foreign fields can be tedious. Soukai relations make this a lot easier.

To get an idea of how they work, let's say you are implementing a Blog and have a `Post` and `User` models. This is how you could create and read posts for a user:

```ts
// Create a post...
await Post.create({ title: '...', authorUrl: user.url });

// Get user posts...
const posts = (await Post.all()).filter((post) => post.authorUrl === user.url);
```

Using relations, this can be a lot simpler:

```ts
// Create a post...
await user.relatedPosts.create({ title: '...' });

// Get user posts...
await user.loadRelation('posts');

const posts = user.posts;
```

In this small example, it may seem like relations are not that useful. But in a real application, where the logic is split in different modules and keeping track of the data isn't so straightforward, they can be life savers.

## Definition

Conceptually, there are three types of relations: One-to-one, One-to-many and Many-to-many. But this taxonomy can be limiting to declare relations in our data modeling. This is because models can hold array fields, and the same relation can be represented in multiple ways.

For example, imagine that you have a `Post` model and a `User` model. Conceptually, a user can write many posts and a post can have a single author (a user). This is a One-to-many relation, one user (the author) to many posts. However, there are different ways to model this relation:

- The post model could have an `authorUrl` field.
- The user model could have a `postUrls` array field.
- Both `authorUrl` and `postUrls` could be declared.

For this reason, it's more useful to declare relations in each model indicating how they reference each other. You can do it using the following 4 helpers:

|                 | A model references | A model is referenced by |
| --------------- | ------------------ | ------------------------ |
| One model       | `belongsToOne`     | `hasOne`                 |
| Multiple models | `belongsToMany`    | `hasMany`                |

The 3 scenarios we explored above would be declared as:

- A post `belongsToOne` user and a user `hasMany` posts.
- A user `belongsToMany` posts and a post `hasOne` user.
- All 4 relations can be declared.

These relations can be declared in the `relations` option of the schema.

Here's how you'd implement the first scenario:

::: code-group

```ts [Post.schema.ts]
import { belongsToOne, defineSchema } from 'soukai-bis';
import { string, url } from 'zod';

export default defineSchema({
    fields: {
        title: string(),
        authorUrl: url().optional(),
    },
    relations: {
        author: belongsToOne('User', 'authorUrl'),
    },
});
```

```ts [User.schema.ts]
import { defineSchema, hasMany } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    fields: {
        name: string(),
    },
    relations: {
        posts: hasMany('Post', 'authorUrl'),
    },
});
```

:::

The arguments for these helpers are the name of the related model and the foreign key name. Model names are resolved using the [booted models](./models.md#booting-models).

### Cascading deletes

By default, deleting a model leaves its related models untouched. If you want them to be deleted as well, you can use `.onDelete('cascade')` in the relation definition:

```ts
export default defineSchema({
    fields: {
        name: string(),
    },
    relations: {
        posts: hasMany('Post', 'authorUrl').onDelete('cascade'),
    },
});
```

With this definition, calling `user.delete()` will also delete the user's posts, loading them first if necessary. Cascades are followed through the relations of the deleted models as well, both in the same document and in other documents, and each deleted model emits its own `deleted` event.

::: warning
Models in other documents are deleted one document at a time, so a failure half-way through can leave some of them already deleted.
:::

## Usage

Once relations have been defined, related models can be accessed like a normal property. But they will be undefined until they are loaded explicitly using the `loadRelation` method.

For example, this is how you would use the definitions we explored with users and posts:

```ts
const user = await User.findOrFail('https://example.org/users/john#it');

// At this point, this will return undefined
console.log(user.posts);

const posts = await user.loadRelation('posts');

// Loaded models will be returned and also be accessible as a model property
console.log(posts);
console.log(user.posts);
```

The return type is inferred from the relation definition, so `posts` will be typed as `Post[]`. Relations with a single model, such as `belongsToOne` or `hasOne`, return the related model or `null` if it doesn't exist.

You can also check whether a relation has been loaded with `isRelationLoaded`, or load it only if necessary with `loadRelationIfUnloaded`.

### Relation instances

Similar to [magic attributes](./models.md#magic-attributes), relations also have magic properties to access the `Relation` instance:

```ts
const posts = await user.relatedPosts.load();

console.log(posts);
```

The `Relation` instance comes with some helper methods to manage related models:

- `create`: Creates a new related model, setting foreign keys automatically.
- `attach`: Associates a model (or a new model created from the given attributes) without saving it.
- `save`: Associates a model and saves it.
- `detach`: Removes the association between models. You can also pass the `{ delete: true }` option to [mark the detached models for deletion](./engines.md#marking-models-for-deletion).
- `delete`: Deletes related models.

### Typing relation instances

Related model properties are typed automatically from the schema, so `user.posts` will be typed as `Post[] | undefined`. But that's not the case for relation instances, so methods like `user.relatedPosts.create()` will return a generic `Model` instead of a `Post`.

If you want these to be typed, you can declare the relation instances in your model classes:

::: code-group

```ts [User.ts]
import type { HasManyRelation } from 'soukai-bis';

import type Post from './Post';
import Model from './User.schema';

export default class User extends Model {
    declare public readonly relatedPosts: HasManyRelation<this, Post, typeof Post>;
}
```

```ts [Post.ts]
import type { BelongsToOneRelation } from 'soukai-bis';

import Model from './Post.schema';
import type User from './User';

export default class Post extends Model {
    declare public readonly relatedAuthor: BelongsToOneRelation<this, User, typeof User>;
}
```

:::

Each relation helper has its own relation class (`HasManyRelation` for `hasMany`, `BelongsToOneRelation` for `belongsToOne`, etc.), and they all take the same type arguments: the parent model, the related model, and the related model class.

### Loading from other containers

Relations that don't use the same document, such as the `hasMany` relation in our example, will load related models from the [default container](./models.md#containers) of the related model. If they are stored somewhere else, you can call `from()` on `hasMany` and `hasOne` relations with the name of a property holding the container url (which can be a field, or a getter):

```ts
import { defineSchema, hasMany } from 'soukai-bis';
import { string, url } from 'zod';

export default defineSchema({
    fields: {
        name: string(),
        postsContainerUrl: url().optional(),
    },
    relations: {
        posts: hasMany('Post', 'authorUrl').from('postsContainerUrl'),
    },
});
```

Related models will be loaded from that container, and new models created through the relation will be stored there as well. If the property is empty, the default container will be used instead.

## Using the same document

When working with RDF, it's common to store multiple resources in the same document. This can be configured calling `usingSameDocument()` during the definition.

When related models are stored in the same document, they'll be saved automatically when the parent model (the one who defines the relation) is saved, and they'll be loaded automatically when the parent model is read. Also, the hash of those models will be a UUID instead of the one defined in their `rdfDefaultResourceHash` option.

For example, let's say that we want to model a Music Band with all their members, and we want to store all the RDF resources in the same document:

::: code-group

```ts [Band.schema.ts]
import { defineSchema, hasMany } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'MusicGroup',
    fields: {
        name: string(),
    },
    relations: {
        members: hasMany('Person', 'bandUrl').usingSameDocument(),
    },
});
```

```ts [Person.schema.ts]
import { defineSchema } from 'soukai-bis';
import { string, url } from 'zod';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'Person',
    fields: {
        name: string(),
        bandUrl: url().rdfProperty('memberOf').optional(),
    },
});
```

:::

And here's an example using those models:

```ts
const acdc = await Band.findOrFail('https://example.org/bands/ac-dc#it');

// You can create the model yourself, and it'll be
// stored when the parent is saved.
acdc.relatedMembers.attach(new Person({ name: 'Bon Scott' }));

await acdc.save();

// Or you can use the create() method.
// Notice how we're not specifying the bandUrl in either scenario.
await acdc.relatedMembers.create({ name: 'Angus Young' });
```

### documentContainsMany

There is also a `documentContainsMany` relation, which can be used to declare models that are stored in the same document without any foreign keys pointing to each other:

```ts [TypeIndex.schema.ts]
import { defineSchema, documentContainsMany } from 'soukai-bis';

export default defineSchema({
    rdfClass: 'TypeIndex',
    relations: {
        registrations: documentContainsMany('TypeRegistration'),
    },
});
```

## Container relations

There is a couple of relations that are helpful to work with containers: `contains` and `isContainedBy`.

Here's an example:

::: code-group

```ts [MoviesContainer.schema.ts]
import { contains, defineContainerSchema } from 'soukai-bis';

export default defineContainerSchema({
    relations: {
        movies: contains('Movie'),
    },
});
```

```ts [Movie.schema.ts]
import { defineSchema, isContainedBy } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'Movie',
    fields: {
        title: string().rdfProperty('name'),
    },
    relations: {
        container: isContainedBy('MoviesContainer'),
    },
});
```

:::

These helpers don't take foreign keys because they rely on the `url` of the models and the `resourceUrls` field of containers.

```ts
const movies = await MoviesContainer.createAt('https://example.org/', { name: 'Movies' });

// The movie will be created in the "https://example.org/movies/" container.
await movies.relatedMovies.create({ title: 'Spirited Away' });
```

> [!NOTE]
> Under the hood, the `contains` relation reads all the documents in the container, which means that there could be more than one model per document.
