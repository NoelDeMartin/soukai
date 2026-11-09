import { belongsToMany, defineSchema } from 'soukai-bis';
import { z } from 'zod';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'MusicPlaylist',
    fields: {
        name: z.string(),
        songUrls: z.array(z.url()).rdfProperty('track').default([]),
    },
    relations: {
        songs: belongsToMany('Song', 'songUrls'),
    },
});
