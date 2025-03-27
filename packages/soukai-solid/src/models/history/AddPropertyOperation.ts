import { arrayFrom } from '@noeldemartin/utils';
import { SoukaiError } from 'soukai';

import type { SolidModel } from 'soukai-solid/models/SolidModel';

import Model from './AddPropertyOperation.schema';

export default class AddPropertyOperation extends Model {

    protected applyPropertyUpdate(model: SolidModel, field: string): void {
        const value = model.getAttributeValue(field);

        if (!Array.isArray(value)) {
            throw new SoukaiError('Can\'t apply Add operation to non-array field (should be Set instead)');
        }

        model.setAttributeValue(field, [...value, ...arrayFrom(this.value)]);
    }

}
