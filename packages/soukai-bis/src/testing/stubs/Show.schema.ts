import { belongsToMany, defineSchema, InvalidationStrategies, loaded } from 'soukai-bis';
import { z } from 'zod';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'TVSeries',
    fields: {
        name: z.string().useAsSlug(),
        seasonUrls: z.array(z.url()).rdfProperty('containsSeason').default([]),
    },
    relations: {
        seasons: belongsToMany('Season', 'seasonUrls').usingSameDocument().onDelete('cascade'),
    },
    computed: {
        pendingEpisodeDates: {
            invalidationStrategy: InvalidationStrategies.CONTAINER,
            compute(show) {
                return loaded(show, 'seasons')
                    .flatMap((season) => loaded(season, 'episodes'))
                    .map((episode) => loaded(episode, 'watchAction')?.startTime)
                    .filter((date) => !!date);
            },
        },
    },
});
