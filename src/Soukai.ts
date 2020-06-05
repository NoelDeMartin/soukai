import { engineClosesConnections } from '@/engines/ClosesConnections';
import Engine from '@/engines/Engine';
import Model from '@/models/Model';

import SoukaiError from '@/errors/SoukaiError';

import Arr from '@/internal/utils/Arr';

export class Soukai {

    private _engine: Engine;

    private _bootedModels: Array<typeof Model> = [];

    public useEngine(engine: Engine): void {
        this._engine = engine;
    }

    public loadModel(name: string, model: typeof Model): void {
        if (Arr.contains(this._bootedModels, model)) {
            return;
        }

        model.boot(name);
        this._bootedModels.push(model);
    }

    public loadModels(models: { [name: string]: typeof Model}): void {
        for (const name in models) {
            if (models.hasOwnProperty(name)) {
                this.loadModel(name, models[name]);
            }
        }
    }

    public requireEngine(): Engine {
        if (!this._engine) {
            throw new SoukaiError(
                'Engine must be initialized before performing any operations. ' +
                'Learn more at https://soukai.js.org/guide/engines.html',
            );
        }

        return this._engine;
    }

    public async closeConnections(): Promise<void> {
        if (!this._engine || !engineClosesConnections(this._engine)) {
            return;
        }

        await this._engine.closeConnections();
    }

    public get engine(): Engine {
        return this._engine;
    }

}

export default new Soukai();
