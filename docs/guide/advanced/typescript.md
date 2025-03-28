# TypeScript

Most examples in this guide are written using plain JavaScript, but the library is written in TypeScript and it has some tricks up its sleeve for type inference.

If you try to write some code using the syntax we've seen thus far, you'll quickly run into some issues with [magic attributes](../core-concepts/models.md#magic-attributes):

```ts
class User extends Model {
    static fields = {
        name: FieldType.String,
    };
}

const user = new User({ name: 'John Doe' });

user.name; // [!code error] Property 'name' does not exist on type 'User'
```

One solution would be to declare the missing fields explicitly, but that is redundant and cumbersome to maintain:

```ts
class User extends Model {
    static fields = {
        name: FieldType.String,
    };

    declare public name?: string;
}
```

If you're writing your code using TypeScript, you can declare the model schema in a different file instead, using the `defineModelSchema` helper:

::: code-group

```ts [User.ts]
import Model from './User.schema';

class User extends Model {}
```

```ts [User.schema.ts]
export defineModelSchema({
    fields: {
        name: FieldType.String,
    },
});
```

:::

> [!WARNING] ⚠️ Limited inference
> At the moment, this approach only works for Model attributes which is the biggest pain-point for TypeScript usage. However, this could also work for things like relationships but it hasn't been implemented yet.
>
> In the meantime, it shouldn't be _too painful_ to declare relationships manually:
>
> ```ts
> class User extends Model {
>     declare public posts?: Post[];
>     declare public relatedPosts: HasManyRelation<this, Post, typeof Post>;
>
>     public postsRelationship(): Relation {
>         return this.hasMany(Post, 'authorId');
>     }
> }
> ```
