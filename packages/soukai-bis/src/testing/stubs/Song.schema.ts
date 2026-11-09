import { defineSchema, hasMany } from 'soukai-bis';
import { z } from 'zod';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'MusicRecording',
    fields: {
        title: z.string().rdfProperty('name').useAsSlug(),
    },
    relations: {
        playlists: hasMany('Playlist', 'songUrls'),
    },
});
