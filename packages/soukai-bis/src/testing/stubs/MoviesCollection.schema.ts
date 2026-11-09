import { contains, defineContainerSchema } from 'soukai-bis';

export default defineContainerSchema({
    relations: {
        movies: contains('Movie'),
    },
});
