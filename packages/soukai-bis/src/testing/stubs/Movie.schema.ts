import { string } from 'zod';
import { defineSchema, hasOne } from 'soukai-bis';

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
