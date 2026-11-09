import type { BelongsToManyRelation } from 'soukai-bis';

import type InverseEpisode from './InverseEpisode';
import Model from './InverseSeason.schema';

export default class InverseSeason extends Model {
    declare public relatedEpisodes: BelongsToManyRelation<this, InverseEpisode, typeof InverseEpisode>;
}
