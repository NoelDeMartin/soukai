import { loaded } from 'soukai-bis';
import type { BelongsToManyRelation, ComputedAttribute } from 'soukai-bis';

import Model from './Show.schema';
import type Season from './Season';

export default class Show extends Model {

    declare public readonly pendingEpisodeDates: ComputedAttribute<Date[]>;
    declare public readonly relatedSeasons: BelongsToManyRelation<this, Season, typeof Season>;
    declare public readonly seasons?: Season[];

    public static computed = {
        pendingEpisodeDates(show: Show): Date[] {
            return loaded(show, 'seasons')
                .flatMap((season) => loaded(season, 'episodes'))
                .map((episode) => loaded(episode, 'watchAction')?.startTime)
                .filter((date) => !!date);
        },
    };

}
