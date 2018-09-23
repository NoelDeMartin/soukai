import Engine from '@/lib/Engine';
import Model from '@/lib/Model';

import SoukaiError from '@/lib/errors/SoukaiError';

export class Soukai {

    private _engine: Engine;

    public useEngine(engine: Engine): void {
        this._engine = engine;
    }

    public loadModel(name: string, model: typeof Model): void {
        model.boot(name);
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
            throw new SoukaiError('Engine must be initialized before performing any operations');
        }
    }

    public get engine(): Engine {
        return this._engine;
    }

}

export default new Soukai();
