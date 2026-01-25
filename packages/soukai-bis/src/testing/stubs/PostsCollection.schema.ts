import { defineContainerSchema } from 'soukai-bis/models/schema-containers';
import { contains } from 'soukai-bis/models/relations/fluent';

import Post from './Post';

export default defineContainerSchema({
    relations: {
        posts: contains(() => Post),
    },
});
