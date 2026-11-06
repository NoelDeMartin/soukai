# Relationships

For the most part, you should be able to get by using Models and Engines. But if you're working on a system with a lot of relationships, and you often find yourself updating foreign keys and wiring up data manually, Soukai relationships will make your life a lot easier.

To get an idea of how they work, let's say you have the following code to wire up together a User in a Blog platform with their posts:

```ts
// Create a post...
await Post.create({ title: '...', authorUrl: user.url });

// Get user posts...
const posts = (await Post.all()).filter((post) => post.authorUrl === user.url);
```

Using relationships, you'll be able to do the following instead:

```ts
// Create a post...
await user.relatedPosts.create({ title: '...' });

// Get user posts...
await user.loadRelation('posts');

const posts = user.posts;
```

In this small example, it may seem like Relationships are not that useful. But in a real application, where the logic is split in different modules and keeping track of the data isn't so straightforward, they can be life savers.

## Definition

Conceptually, there are three types of relationships: One-to-one, One-to-many and Many-to-many. But this taxonomy can be limiting to declare relationships in our data modeling. This is because models can hold array fields, and the same relationship can be represented in multiple ways.

For example, imagine that you have a `Post` model and a `User` model. Conceptually, a user can write many posts and a post can have a single author (a user). This is a One-to-many relationship, one user (the author) to many posts. However, there are different ways to model this relationship:

- The post model could have an `authorUrl` field.
- The user model could have a `postUrls` array field.
- Both `authorUrl` and `postUrls` could be declared.

For this reason, it's more useful to declare relationships in each model indicating how they reference each other. You can do it using the following 4 helpers:

|                 | A model references | A model is referenced by |
| --------------- | ------------------ | ------------------------ |
| One model       | `belongsToOne`     | `hasOne`                 |
| Multiple models | `belongsToMany`    | `hasMany`                |

The 3 scenarios we explored above would be declared as:

- A post belongs to one user and a user has many posts.
- A user belongs to many posts and a post has one user.
- All 4 relationships can be declared.

These relations can be declared in the `relations` option of the schema.

Here's how you'd implement the first scenario:

::: code-group

```ts [Post.schema.ts]
import { belongsToOne, defineSchema } from 'soukai-bis';
import { string, url } from 'zod';

import User from './User';

export default defineSchema({
    fields: {
        title: string(),
        authorUrl: url().optional(),
    },
    relations: {
        author: belongsToOne(() => User, 'authorUrl'),
    },
});
```

```ts [User.schema.ts]
import { defineSchema, hasMany } from 'soukai-bis';
import { string } from 'zod';

import Post from './Post';

export default defineSchema({
    fields: {
        name: string(),
    },
    relations: {
        posts: hasMany(() => Post, 'authorUrl'),
    },
});
```

:::

The arguments for these helpers are the related model class and the foreign key name. The related model class can be declared in three ways:

- Passing the model class directly.
- Passing a function that returns the model class, which is useful to avoid problems with circular imports (like in the example above, where both models reference each other).
- Passing the name of the model as a string, which will be resolved with the [booted models](../getting-started/configuration.md). In order for TypeScript to accept the name, you'll also need to declare it in the [models registry](#models-registry).

::: warning TODO
Previous versions of Soukai could infer foreign key names from model names, and also supported declaring local keys. At the moment, the foreign key must always be declared and the local key is always the `url` of the model.

It was also possible to indicate what happens with related models upon deletion, using `.onDelete('cascade')`. This hasn't been implemented yet.
:::

### Declaring types

Related models are inferred from the schema, so `user.posts` will be typed as `Post[] | undefined` (even when models reference each other). However, relation instances such as `user.relatedPosts` (which you'll learn about in the next section) are not aware of the related model types, so methods like `create` or `load` will return a generic `Model`. You can fix this by declaring their types in the model class:

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

Each relationship helper has its own relation class, such as `HasManyRelation` for `hasMany`, `BelongsToOneRelation` for `belongsToOne`, or `ContainsRelation` for `contains`.

### Models registry

If you declare related models using their names, you'll also need to register them in the `ModelsRegistry` interface for TypeScript to know about them. This is also used to infer the return type of `requireBootedModel`:

```ts
import type Post from './Post';
import type User from './User';

declare module 'soukai-bis' {
    interface ModelsRegistry {
        Post: typeof Post;
        User: typeof User;
    }
}
```

## Usage

Once the relationships have been defined, related models can be accessed like a normal property. But they will be undefined until they are loaded explicitly using the `loadRelation` method.

For example, this is how you would use the definitions we explored with users and posts:

```ts
const user = await User.findOrFail('https://example.org/users/john#it');

// At this point, this will return undefined
console.log(user.posts);

const posts = await user.loadRelation<Post[]>('posts');

// Loaded models will be returned and also be accessible as a model property
console.log(posts);
console.log(user.posts);
```

Notice how we indicated the type of the related models when calling `loadRelation`, given that it can't be inferred from the relationship name.

You can also check whether a relationship has been loaded with `isRelationLoaded`, or load it only if necessary with `loadRelationIfUnloaded`.

Similar to [magic attributes](./models.md#magic-attributes), relationships also have magic properties to access the `Relation` instance:

```ts
const posts = await user.relatedPosts.load();

console.log(posts);
```

The `Relation` instance comes with some helper methods to manage related models:

- `create`: Creates a new related model, setting foreign keys automatically.
- `attach`: Associates a model (or a new model created from the given attributes) without saving it.
- `save`: Associates a model and saves it.
- `detach`: Removes the association between models. You can also pass the `{ delete: true }` option to mark the detached models for deletion (models stored in the [same document](#using-the-same-document) will be deleted when the parent model is saved).
- `delete`: Deletes related models.

```ts
// Notice how we're not specifying the authorUrl in either scenario.
await user.relatedPosts.create({ title: 'Hello World!' });

const post = user.relatedPosts.attach({ title: 'Hello again!' });

await post.save();
```

Relationships that don't use the same document, such as the `hasMany` relationship in our example, will load related models from the [default container](./models.md#containers) of the related model. If they are stored somewhere else, you can call `from()` on `hasMany` and `hasOne` relationships with the name of a property holding the container url (which can be a field, or a getter):

```ts [User.schema.ts]
import { defineSchema, hasMany } from 'soukai-bis';
import { string, url } from 'zod';

import Post from './Post';

export default defineSchema({
    fields: {
        name: string(),
        postsContainerUrl: url().optional(),
    },
    relations: {
        posts: hasMany(() => Post, 'authorUrl').from('postsContainerUrl'),
    },
});
```

Related models will be loaded from that container, and new models created through the relationship will be stored there as well. If the property is empty, the default container will be used instead.

## Using the same document

When working with RDF, it's common to store multiple resources in the same document. This can be configured with the `usingSameDocument()` method.

When related models are stored in the same document, they'll be saved automatically when the parent model (the one who defines the relationship) is saved, and they'll be loaded automatically when the parent model is read. Also, the hash of those models will be a UUID instead of the one defined in their `rdfDefaultResourceHash` option.

For example, let's say that we want to model a Music Band with all their members, and we want to store all the RDF resources in the same document:

::: code-group

```ts [Band.schema.ts]
import { defineSchema, hasMany } from 'soukai-bis';
import { string } from 'zod';

import Person from './Person';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'MusicGroup',
    fields: {
        name: string(),
    },
    relations: {
        members: hasMany(() => Person, 'bandUrl').usingSameDocument(),
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

// You can create the model yourself, and it'll be stored when the parent is saved.
acdc.relatedMembers.attach(new Person({ name: 'Bon Scott' }));

await acdc.save();

// Or you can use the create method.
// Notice how we're not specifying the bandUrl in either scenario.
await acdc.relatedMembers.create({ name: 'Angus Young' });
```

There is also a `documentContainsMany` relationship, which can be used to declare models that are stored in the same document without any foreign keys pointing to each other:

```ts [TypeIndex.schema.ts]
import { defineSchema, documentContainsMany } from 'soukai-bis';

import TypeRegistration from './TypeRegistration';

export default defineSchema({
    rdfClass: 'TypeIndex',
    relations: {
        registrations: documentContainsMany(() => TypeRegistration),
    },
});
```

## contains and isContainedBy

There is a couple of relationships that are helpful to work with containers: `contains` and `isContainedBy`.

Here's an example:

::: code-group

```ts [MoviesContainer.schema.ts]
import { contains, defineContainerSchema } from 'soukai-bis';

import Movie from './Movie';

export default defineContainerSchema({
    relations: {
        movies: contains(() => Movie),
    },
});
```

```ts [Movie.schema.ts]
import { defineSchema, isContainedBy } from 'soukai-bis';
import { string } from 'zod';

import MoviesContainer from './MoviesContainer';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'Movie',
    fields: {
        title: string().rdfProperty('name'),
    },
    relations: {
        container: isContainedBy(() => MoviesContainer),
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
> Under the hood, the `contains` relationship reads all the documents in the container, which means that there could be more than one model per document.
