import type { SolidModel } from 'soukai-solid/models/SolidModel';

import Model from './PropertyOperation.schema';

export default class PropertyOperation extends Model {
    public apply(model: SolidModel): void {
        const field = model.static().getRdfPropertyField(this.property);

        if (!field) {
            return;
        }

        this.applyPropertyUpdate(model, field);
    }

    // oxlint-disable-next-line typescript/no-unused-vars
    protected applyPropertyUpdate(model: SolidModel, field: string): void {
        //
    }
}
