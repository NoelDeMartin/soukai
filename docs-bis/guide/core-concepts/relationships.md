# Relationships

For the most part, you should be able to get by using Models and Engines. But if you're working on a system with a lot of relationships, and you often find yourself updating foreign keys and wiring up data manually, Soukai relationships will make your life a lot easier.

To get an idea of how they work, let's say you have the following code to wire up together a User in a Blog platform with their posts:

```js
// Create a post...
await Post.create({ title: '...', authorUrl: user.url });

// Get user posts...
const posts = (await Post.all()).filter((post) => post.authorUrl === user.url);
```

Using relationships, you'll be able to do the following instead:

```js
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

```js
import { belongsToOne, defineSchema, hasMany } from 'soukai-bis';
import { string, url } from 'zod';

class Post extends defineSchema({
    fields: {
        title: string(),
        authorUrl: url().optional(),
    },
    relations: {
        author: belongsToOne('User', 'authorUrl'),
    },
}) {}

class User extends defineSchema({
    fields: {
        name: string(),
    },
    relations: {
        posts: hasMany(() => Post, 'authorUrl'),
    },
}) {}
```

The arguments for these helpers are the related model class and the foreign key name. The related model class can be declared in three ways:

- Passing the model class directly.
- Passing a function that returns the model class, which is useful to avoid problems with circular imports.
- Passing the name of the model as a string, which will be resolved with the [booted models](../getting-started/configuration.md).

::: warning TODO
Previous versions of Soukai could infer foreign key names from model names, and also supported declaring local keys. At the moment, the foreign key must always be declared and the local key is always the `url` of the model.

It was also possible to indicate what happens with related models upon deletion, using `.onDelete('cascade')`. This hasn't been implemented yet.
:::

## Usage

Once the relationships have been defined, related models can be accessed like a normal property. But they will be undefined until they are loaded explicitly using the `loadRelation` method.

For example, this is how you would use the definitions we explored with users and posts:

```js
const users = await User.all();
const user = users[0];

// At this point, this will return undefined
console.log(user.posts);

const posts = await user.loadRelation('posts');

// Loaded models will be returned and also be accessible as a model property
console.log(posts);
console.log(user.posts);
```

You can also check whether a relationship has been loaded with `isRelationLoaded`, or load it only if necessary with `loadRelationIfUnloaded`.

Similar to [magic attributes](./models.md#magic-attributes), relationships also have magic properties to access the `Relation` instance:

```js
const posts = await user.relatedPosts.load();

console.log(posts);
```

The `Relation` instance comes with some helper methods to manage related models:

- `create`: Creates a new related model, setting foreign keys automatically.
- `attach`: Associates a model (or a new model created from the given attributes) without saving it.
- `save`: Associates a model and saves it.
- `detach`: Removes the association between models. You can also pass the `{ delete: true }` option to mark the detached models for deletion (models stored in the [same document](#using-the-same-document) will be deleted when the parent model is saved).
- `delete`: Deletes related models.

```js
// Notice how we're not specifying the authorUrl in either scenario.
await user.relatedPosts.create({ title: 'Hello World!' });

const post = user.relatedPosts.attach({ title: 'Hello again!' });

await post.save();
```

> [!NOTE]
> Relationships that don't use the same document, such as the `hasMany` relationship in our example, will load related models from the default container of the related model. You can read more about it in the [Containers](./models.md#containers) section.

## Using the same document

When working with RDF, it's common to store multiple resources in the same document. This can be configured with the `usingSameDocument()` method.

When related models are stored in the same document, they'll be saved automatically when the parent model (the one who defines the relationship) is saved, and they'll be loaded automatically when the parent model is read. Also, the hash of those models will be a UUID instead of the one defined in their `rdfDefaultResourceHash` option.

For example, let's say that we want to model a Music Band with all their members, and we want to store all the RDF resources in the same document:

```js
class Band extends defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'MusicGroup',
    fields: {
        name: string(),
    },
    relations: {
        members: hasMany(() => Person, 'bandUrl').usingSameDocument(),
    },
}) {}

class Person extends defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'Person',
    fields: {
        name: string(),
        bandUrl: url().rdfProperty('memberOf').optional(),
    },
}) {}
```

And here's an example using those models:

```js
const acdc = await Band.findOrFail('https://example.org/bands/ac-dc#it');

// You can create the model yourself, and it'll be stored when the parent is saved.
acdc.relatedMembers.attach(new Person({ name: 'Bon Scott' }));

await acdc.save();

// Or you can use the create method.
// Notice how we're not specifying the bandUrl in either scenario.
await acdc.relatedMembers.create({ name: 'Angus Young' });
```

There is also a `documentContainsMany` relationship, which can be used to declare models that are stored in the same document without any foreign keys pointing to each other:

```js
class TypeIndex extends defineSchema({
    rdfClass: 'TypeIndex',
    relations: {
        registrations: documentContainsMany(() => TypeRegistration),
    },
}) {}
```

## contains and isContainedBy

There is a couple of relationships that are helpful to work with containers: `contains` and `isContainedBy`.

Here's an example:

```js
import { contains, defineContainerSchema, defineSchema, isContainedBy } from 'soukai-bis';

class MoviesContainer extends defineContainerSchema({
    relations: {
        movies: contains(() => Movie),
    },
}) {}

class Movie extends defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'Movie',
    fields: {
        title: string().rdfProperty('name'),
    },
    relations: {
        container: isContainedBy(() => MoviesContainer),
    },
}) {}
```

These helpers don't take foreign keys because they rely on the `url` of the models and the `resourceUrls` field of containers.

```js
const movies = await MoviesContainer.createAt('https://example.org/', { name: 'Movies' });

// The movie will be created in the "https://example.org/movies/" container.
await movies.relatedMovies.create({ title: 'Spirited Away' });
```

> [!NOTE]
> Under the hood, the `contains` relationship reads all the documents in the container, which means that there could be more than one model per document.
