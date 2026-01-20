import { string } from 'zod';

import { defineSchema } from 'soukai-bis/models/schema';
import { hasOne } from 'soukai-bis/models/relations/schema';

import WatchAction from './WatchAction';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'Movie',
    fields: {
        title: string().rdfProperty('name'),
    },
    relations: {
        action: hasOne(() => WatchAction, 'movieUrl').usingSameDocument(),
    },
});
