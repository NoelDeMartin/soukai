import { Engine } from './engines';
import { Model } from './model';

interface Soukai {

    engine: Engine;

    useEngine(engine: Engine): void;

    loadModel(name: string, model: typeof Model): void;

    loadModels(models: { [name: string]: typeof Model }): void;

}

declare const Soukai: Soukai;

export default Soukai;
