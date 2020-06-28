import { Engine } from './engines';
import { Model } from './model';

interface Soukai {

    engine: Engine;

    useEngine(engine: Engine): void;

    requireEngine(): Engine;

    model(name: string): typeof Model;

    loadModel(name: string, model: typeof Model): void;

    loadModels(models: { [name: string]: typeof Model }): void;

    closeConnections(): Promise<void>;

}

declare const Soukai: Soukai;

export default Soukai;
