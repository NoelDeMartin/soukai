import { defineSchema, hasOne } from 'soukai-bis';
import { z } from 'zod';

export default defineSchema({
    fields: {
        name: z.string(),
    },
    relations: {
        season: hasOne('InverseSeason', 'episodeUrls'),
    },
});
