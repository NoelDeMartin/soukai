import Model from './Model';
import Engine from './Engine';

export class Soukai {

    private _engine: Engine;

    public useEngine(engine: Engine): void {
        this._engine = engine;
    }

    public loadModels(models: { [name: string]: typeof Model}): void {
        for (const name in models) {
            if (models.hasOwnProperty(name)) {
                this.loadModel(name, models[name]);
            }
        }
    }

    public loadModel(name: string, model: typeof Model): void {
        model.boot(name);
    }

    public get engine(): Engine {
        return this._engine;
    }

}

export default new Soukai();
