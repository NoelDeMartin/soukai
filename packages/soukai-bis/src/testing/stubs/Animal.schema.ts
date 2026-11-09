import { belongsToOne, defineSchema } from 'soukai-bis';
import { z } from 'zod';

export default defineSchema({
    fields: {
        ownerUrl: z.url().optional(),
    },
    relations: {
        owner: belongsToOne('User', 'ownerUrl'),
    },
});
