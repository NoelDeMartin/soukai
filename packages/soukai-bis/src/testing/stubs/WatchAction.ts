import type { BelongsToOneRelation } from 'soukai-bis';

import Model from './WatchAction.schema';
import type Episode from './Episode';

export default class WatchAction extends Model {

    declare public readonly relatedEpisode: BelongsToOneRelation<this, Episode, typeof Episode>;
    declare public readonly episode?: Episode;

}
