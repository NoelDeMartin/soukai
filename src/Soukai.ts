import Engine from '@/engines/Engine';
import Model from '@/models/Model';

import SoukaiError from '@/errors/SoukaiError';

export class Soukai {

    private _engine: Engine;

    private _bootedModels: Array<typeof Model> = [];

    public useEngine(engine: Engine): void {
        this._engine = engine;
    }

    public loadModel(name: string, model: typeof Model): void {
        if (this._bootedModels.indexOf(model) === -1) {
            model.boot(name);

            this._bootedModels.push(model);
        }
    }

    public loadModels(models: { [name: string]: typeof Model}): void {
        for (const name in models) {
            if (models.hasOwnProperty(name)) {
                this.loadModel(name, models[name]);
            }
        }
    }

    public withEngine<T>(callback: (engine: Engine) => T): T {
        if (this._engine) {
            return callback(this._engine);
        } else {
            throw new SoukaiError(
                'Engine must be initialized before performing any operations. ' +
                'Learn more at https://soukai.js.org/guide/engines.html',
            );
        }
    }

    public get engine(): Engine {
        return this._engine;
    }

}

export default new Soukai();
