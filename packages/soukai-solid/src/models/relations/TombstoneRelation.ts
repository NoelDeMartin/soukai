import { SingleModelRelation, requireBootedModel } from 'soukai';

import type Tombstone from 'soukai-solid/models/history/Tombstone';
import type { SolidModel } from 'soukai-solid/models/SolidModel';

export default class TombstoneRelation<Parent extends SolidModel = SolidModel> extends SingleModelRelation<
    Parent,
    Tombstone,
    typeof Tombstone
> {

    constructor(parent: Parent) {
        super(parent, requireBootedModel('Tombstone'));
    }

    public create(): void {
        const TombstoneModel = requireBootedModel<typeof Tombstone>('Tombstone');

        this.related = new TombstoneModel({
            url: this.parent.metadata.url,
            resourceUrl: this.parent.url,
            deletedAt: new Date(),
        });
    }

    public async load(): Promise<Tombstone | null> {
        // Nothing to do here.
        // Tombstones are not meant to coexist with models in storage, this relation is only used
        // as a temporary mechanism to mark a model before deletion.

        return null;
    }

    public setForeignAttributes(): void {
        // Nothing to do here.
        // Tombstones are not meant to coexist with models in storage, this relation is only used
        // as a temporary mechanism to mark a model before deletion.
    }

}
