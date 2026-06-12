import type { BelongsToManyRelation, ComputedAttribute, ComputedProxy } from 'soukai-bis';

import Model from './Show.schema';
import type Season from './Season';

export default class Show extends Model {

    declare public readonly pendingEpisodeDates: ComputedAttribute<Date[]>;
    declare public readonly relatedSeasons: BelongsToManyRelation<this, Season, typeof Season>;
    declare public readonly seasons?: Season[];

    public static computed = {
        pendingEpisodeDates(show: ComputedProxy<Show>): Date[] {
            return show.seasons
                .flatMap((season) => season.episodes)
                .map((episode) => episode.watchAction.startTime)
                .filter((date) => !!date);
        },
    };

}
