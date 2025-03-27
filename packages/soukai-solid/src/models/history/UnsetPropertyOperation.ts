import type { SolidModel } from 'soukai-solid/models/SolidModel';

import Model from './UnsetPropertyOperation.schema';

export default class UnsetPropertyOperation extends Model {

    protected applyPropertyUpdate(model: SolidModel, field: string): void {
        model.unsetAttribute(field);
    }

}
