import Engine from '@/lib/Engine';
import Model from '@/lib/Model';

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

    public get engine(): Engine {
        return this._engine;
    }

}

export default new Soukai();
