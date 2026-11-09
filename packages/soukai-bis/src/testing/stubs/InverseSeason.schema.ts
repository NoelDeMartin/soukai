import { belongsToMany, defineSchema } from 'soukai-bis';
import { z } from 'zod';

export default defineSchema({
    fields: {
        name: z.string(),
        episodeUrls: z.array(z.url()).rdfProperty('episodeUrls').default([]),
    },
    relations: {
        episodes: belongsToMany('InverseEpisode', 'episodeUrls'),
    },
});
