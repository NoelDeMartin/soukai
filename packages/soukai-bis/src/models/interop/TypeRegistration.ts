import type SolidEngine from 'soukai-bis/engines/SolidEngine';
import { requireSolidEngine } from 'soukai-bis/engines/utils';
import type { ModelConstructor } from 'soukai-bis/models/types';

import Model from './TypeRegistration.schema';

export default class TypeRegistration extends Model {
    public static requireEngine(): SolidEngine {
        return requireSolidEngine(super.requireEngine(), `use ${this.modelName} models`);
    }

    public registers(modelClass: ModelConstructor): boolean {
        return modelClass.getRdfClasses().every((rdfClass) => this.forClass.includes(rdfClass));
    }

    public registersContainer(): this is this & { instanceContainer: string } {
        return !!this.instanceContainer;
    }

    public registersInstance(): this is this & { instance: string } {
        return !!this.instance;
    }
}
