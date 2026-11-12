import type { ModelConstructor } from 'soukai-bis/models/types';

import Model from './TypeRegistration.schema';

export default class TypeRegistration extends Model {
    public static remote = true;

    public registers(modelClass: ModelConstructor): boolean {
        return modelClass.matchesRdfClasses(this.forClass);
    }

    public registersContainer(): this is this & { instanceContainer: string } {
        return !!this.instanceContainer;
    }

    public registersInstance(): this is this & { instance: string } {
        return !!this.instance;
    }
}
