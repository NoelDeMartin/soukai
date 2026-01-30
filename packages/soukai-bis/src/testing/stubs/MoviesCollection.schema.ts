import { contains, defineContainerSchema } from 'soukai-bis';

import Movie from './Movie';

export default defineContainerSchema({
    relations: {
        movies: contains(() => Movie),
    },
});
