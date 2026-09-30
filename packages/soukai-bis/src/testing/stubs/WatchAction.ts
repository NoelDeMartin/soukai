import type { BelongsToOneRelation } from 'soukai-bis';

import type Episode from './Episode';
import Model from './WatchAction.schema';

export default class WatchAction extends Model {
    declare public readonly relatedEpisode: BelongsToOneRelation<this, Episode, typeof Episode>;
    declare public readonly episode?: Episode;
}
