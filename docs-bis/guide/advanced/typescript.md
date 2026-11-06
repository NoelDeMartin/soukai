# TypeScript

The library is written in TypeScript, and model schemas are designed to take full advantage of type inference. Attributes are inferred from the Zod types declared in the schema, and relationships are inferred from the relations:

```ts
class User extends defineSchema({
    fields: {
        name: string(),
        age: number().optional(),
    },
    relations: {
        posts: hasMany(Post, 'authorUrl'),
    },
}) {}

const user = new User({ name: 'John Doe' });

user.name; // string
user.age; // number | undefined
user.posts; // Post[] | undefined
user.relatedPosts; // HasManyRelation
```

However, declaring schemas inline can become difficult to read, so it's recommended to declare them in a different file:

::: code-group

```ts [User.ts]
import Model from './User.schema';

export default class User extends Model {}
```

```ts [User.schema.ts]
import { defineSchema } from 'soukai-bis';
import { number, string } from 'zod';

export default defineSchema({
    fields: {
        name: string(),
        age: number().optional(),
    },
});
```

:::

## Relationships

When models reference each other, you'll often need to declare related classes using a function (or the model name) to avoid circular imports. In those cases, TypeScript may not be able to infer the related model types, so you can declare them manually:

::: code-group

```ts [User.ts]
import type { HasManyRelation } from 'soukai-bis';

import type Post from './Post';
import Model from './User.schema';

export default class User extends Model {
    declare public readonly posts?: Post[];
    declare public readonly relatedPosts: HasManyRelation<this, Post, typeof Post>;
}
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

## Models registry

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

## Zod extensions

The Zod extensions installed by `soukai-bis/patch-zod` (such as `.rdfProperty()` and `.useAsSlug()`) are also declared in Zod's types, so you can use them anywhere in your code once `soukai-bis` is imported.
