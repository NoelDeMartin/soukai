import type { SolidModel } from '@/models/SolidModel';

import Model from './DeleteOperation.schema';

export default class DeleteOperation extends Model {

    public apply(model: SolidModel): void {
        model.metadata.setAttribute('deletedAt', this.date);
    }

}
