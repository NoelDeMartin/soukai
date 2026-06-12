import type { HasManyRelation, HasOneRelation } from 'soukai-bis';

import Model from './Season.schema';
import type Show from './Show';
import type Episode from './Episode';

export default class Season extends Model {

    declare public readonly relatedShow: HasOneRelation<this, Show, typeof Show>;
    declare public readonly relatedEpisodes: HasManyRelation<this, Episode, typeof Episode>;
    declare public readonly show?: Show;
    declare public readonly episodes?: Episode[];

}
