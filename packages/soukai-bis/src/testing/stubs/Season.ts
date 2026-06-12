import type { HasOneRelation } from 'soukai-bis';

import Model from './Season.schema';
import type Show from './Show';

export default class Season extends Model {

    declare public readonly relatedShow: HasOneRelation<this, Show, typeof Show>;
    declare public readonly show?: Show;

}
