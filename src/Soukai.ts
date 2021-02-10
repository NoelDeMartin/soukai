import { objectHasOwnProperty } from '@noeldemartin/utils';

import { engineClosesConnections } from '@/engines/ClosesConnections';
import Engine from '@/engines/Engine';
import Model from '@/models/Model';

import SoukaiError from '@/errors/SoukaiError';

export class Soukai {

    private _engine: Engine;

    private _bootedModels: { [name: string]: typeof Model } = {};

    public useEngine(engine: Engine): void {
        this._engine = engine;
    }

    public model(name: string): typeof Model {
        return this._bootedModels[name];
    }

    public loadModel(name: string, model: typeof Model): void {
        if (name in model) {
            return;
        }

        model.boot(name);
        this._bootedModels[name] = model;
    }

    public loadModels(models: { [name: string]: typeof Model }): void {
        for (const name in models) {
            if (objectHasOwnProperty(models, name)) {
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
