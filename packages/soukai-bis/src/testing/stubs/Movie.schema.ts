import { defineSchema, hasOne } from 'soukai-bis';
import { string } from 'zod';

import WatchAction from './WatchAction';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'Movie',
    fields: {
        title: string().rdfProperty('name'),
    },
    relations: {
        action: hasOne(() => WatchAction, 'objectUrl').usingSameDocument(),
    },
});
