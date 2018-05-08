import { Engine } from './engines';
import { Model } from './model';

interface Soukai {

    useEngine(engine: Engine): void;

    loadModel(name: string, model: typeof Model): void;

    loadModels(models: { [name: string]: typeof Model }): void;

    engine(): Engine;

}

declare const Soukai: Soukai;

export default Soukai;
