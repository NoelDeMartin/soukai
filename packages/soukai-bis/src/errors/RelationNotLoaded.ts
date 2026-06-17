import type Model from 'soukai-bis/models/Model';

import SoukaiError from './SoukaiError';

export default class RelationNotLoaded extends SoukaiError {

    public constructor(
        public readonly model: Model,
        public readonly relation: string,
    ) {
        super(`Relation ${relation} not loaded on ${model.static().modelName}`);
    }

}
