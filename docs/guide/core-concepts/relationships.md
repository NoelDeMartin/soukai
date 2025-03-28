# Relationships

For the most part, you should be able to get by using Models and Engines. But if you're working on a system with a lot of relationships, and you often find yourself updating foreign keys and wiring up data manually, Soukai relationships will make your life a lot easier.

To get an idea of how they work, let's say you have the following code to wire up together a User in a Blog platform with their posts:

```js
// Create a post...
await Post.create({ title: '...', authorId: user.id });

// Get user posts...
const posts = await Post.all({ authorId: user.id });
```

Using relationships, you'll be able to do the following instead:

```js
// Create a post...
await user.posts.create({ title: '...' });

// Get user posts...
await user.loadRelation('posts');

const posts = user.posts;
```

In this small example, it may seem like Relationships are not that useful. But in a real application, where the logic is split in different modules and keeping track of the data isn't so straightforward, they can be life savers.

## Definition

Conceptually, there are three types of relationships: One-to-one, One-to-many and Many-to-many. But this taxonomy can be limiting to declare relationships in our data modeling. This is because models can hold array fields, and the same relationship can be represented in multiple ways.

For example, imagine that you have a `Post` model and a `User` model. Conceptually, a user can write many posts and a post can have a single author (a user). This is a One-to-many relationship, one user (the author) to many posts. However, there are different ways to model this relationship:

- The post model could have an `authorId` field.
- The user model could have a `postIds` array field.
- Both `authorId` and `postIds` could be declared.

For this reason, it's more useful to declare relationships in each model indicating how they reference each other. You can do it using the following 4 methods:

|                 | A model references | A model is referenced by |
| --------------- | ------------------ | ------------------------ |
| One model       | `belongsToOne`     | `hasOne`                 |
| Multiple models | `belongsToMany`    | `hasMany`                |

The 3 scenarios we explored above would be declared as:

- A post belongs to one user and a user has many posts.
- A user belongs to many posts and a post has one user.
- All 4 relationships can be declared.

These relations can be declared in a model defining a method with the relation name and the `Relationship` suffix.

Here's how you'd implement the first scenario:

```js
class Post extends Model {
    static fields = {
        authorId: FieldType.Key,
    };

    authorRelationship() {
        return this.belongsToOne(User, 'authorId');
    }
}

class User extends Model {
    postsRelationship() {
        return this.hasMany(Post, 'authorId');
    }
}
```

The arguments for these methods are the related model class, the foreign key name, and the local key name.

Key names can be inferred from model and primary key names. In the example above, the foreign key would have been inferred to be `userId`, but we had to declare it because it was `authorId` instead. The local key is correctly inferred to `id`, the primary key of the User model.

It's also possible to indicate what happens with related models upon deletion. For example, if you want to delete all the posts belonging to a user when they are removed:

```js
class User extends Model {
    postsRelationship() {
        return this.hasMany(Post, 'authorId').onDelete('cascade');
    }
}
```

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

Similar to [magic attributes](./models.md#magic-attributes), relationships also have magic properties to access the `Relation` instance:

```js
const posts = await user.relatedPosts.load();

console.log(posts);
```
