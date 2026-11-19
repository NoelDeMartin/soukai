import { defineSchema, hasMany } from 'soukai-bis';
import Movie from 'soukai-bis/testing/stubs/Movie';

export default defineSchema(Movie, {
    relations: {
        actions: hasMany('WatchAction', 'objectUrl').usingSameDocument().onDelete('cascade'),
    },
});
