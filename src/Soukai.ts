import { closeEngineConnections, getEngine, requireEngine, setEngine } from '@/engines';
import { getModel, loadModel, loadModels } from '@/models';
import type { Engine } from '@/engines/Engine';
import type { Model } from '@/models/Model';

/**
 * @deprecated import global methods instead.
 */
export class Soukai {

    /**
     * @deprecated import global `getEngine` method instead.
     */
    public get engine(): Engine | undefined {
        return getEngine();
    }

    /**
     * @deprecated import global `setEngine` method instead.
     */
    public useEngine(engine: Engine | null): void {
        setEngine(engine);
    }

    /**
     * @deprecated import global `getModel` method instead.
     */
    public model(name: string): typeof Model {
        return getModel(name);
    }

    /**
     * @deprecated import global `loadModel` method instead.
     */
    public loadModel(name: string, model: typeof Model): void {
        loadModel(name, model);
    }

    /**
     * @deprecated import global `loadModels` method instead.
     */
    public loadModels(models: Record<string, typeof Model>): void {
        loadModels(models);
    }

    /**
     * @deprecated import global `requireEngine` method instead.
     */
    public requireEngine(): Engine {
        return requireEngine();
    }

    /**
     * @deprecated import global `closeConnections` method instead.
     */
    public async closeConnections(): Promise<void> {
        await closeEngineConnections();
    }

}

/**
 * @deprecated import global methods instead.
 */
export default new Soukai();
