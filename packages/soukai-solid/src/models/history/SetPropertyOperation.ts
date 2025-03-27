import type { SolidModel } from 'soukai-solid/models/SolidModel';

import Model from './SetPropertyOperation.schema';

export default class SetPropertyOperation extends Model {

    protected applyPropertyUpdate(model: SolidModel, field: string): void {
        model.setAttributeValue(field, this.value);
    }

}
