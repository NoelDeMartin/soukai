import { contains, defineContainerSchema } from 'soukai-bis';

export default defineContainerSchema({
    relations: {
        posts: contains('Post'),
    },
});
