import { belongsToMany, defineSchema } from 'soukai-bis';
import { array, string, url } from 'zod';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'MovieSeries',
    fields: {
        name: string(),
        movieUrls: array(url()).rdfProperty('hasPart').default([]),
    },
    relations: {
        movies: belongsToMany('Movie', 'movieUrls').onDelete('cascade'),
    },
});
