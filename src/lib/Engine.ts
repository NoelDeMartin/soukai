import * as Database from './Database';

import Model from '@/lib/Model';

export default interface Engine {

    create(model: typeof Model, attributes: Database.Attributes): Promise<Database.Key>;

    readOne(model: typeof Model, id: Database.Key): Promise<Database.Document>;

    readMany(model: typeof Model): Promise<Database.Document[]>;

    update(
        model: typeof Model,
        id: Database.Key,
        dirtyAttributes: Database.Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(model: typeof Model, id: Database.Key): Promise<void>;

}
