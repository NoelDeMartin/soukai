import type { SolidModel } from 'soukai-solid/models/SolidModel';

import Model from './SetPropertyOperation.schema';

export default class SetPropertyOperation extends Model {

    protected applyPropertyUpdate(model: SolidModel, field: string): void {
        const definition = model.static().getFieldDefinition(field);
        const value = definition.deserialize ? definition.deserialize(this.value) : this.value;

        model.setAttributeValue(field, value);
    }

}
