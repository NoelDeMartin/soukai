import { belongsToOne, defineSchema, hasOne } from 'soukai-bis';
import { string, url } from 'zod';

import Season from './Season';
import WatchAction from './WatchAction';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'TVEpisode',
    fields: {
        name: string(),
        seasonUrl: url().optional(),
    },
    relations: {
        season: belongsToOne(() => Season, 'seasonUrl'),
        watchAction: hasOne(() => WatchAction, 'objectUrl'),
    },
});
