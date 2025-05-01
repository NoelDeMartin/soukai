import type { Model } from 'soukai';
import type { SolidModel } from 'soukai-solid/models/SolidModel';

export function isSolidModel(model: typeof Model): model is typeof SolidModel {
    return 'rdfContexts' in model;
}
