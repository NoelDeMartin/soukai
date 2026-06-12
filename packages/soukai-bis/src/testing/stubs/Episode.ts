import type { BelongsToOneRelation, HasOneRelation } from 'soukai-bis';

import Model from './Episode.schema';
import type Season from './Season';
import type WatchAction from './WatchAction';

export default class Episode extends Model {

    declare public readonly relatedSeason: BelongsToOneRelation<this, Season, typeof Season>;
    declare public readonly relatedWatchAction: HasOneRelation<this, WatchAction, typeof WatchAction>;
    declare public readonly season?: Season;
    declare public readonly watchAction?: WatchAction;

}
