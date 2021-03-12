import { closeEngineConnections, getEngine, requireEngine, setEngine } from '@/engines';
import type { Engine } from '@/engines/Engine';
import type { Model } from '@/models/Model';

/**
 * @deprecated import global methods instead.
 */
export class Soukai {

    private _bootedModels: Record<string, typeof Model> = {};

    /**
     * @deprecated import global `getEngine` method instead.
     */
    public get engine(): Engine | undefined {
        return getEngine();
    }

    /**
     * @deprecated import global `requireEngine` method instead.
     */
    public requireEngine(): Engine {
        return requireEngine();
    }

    /**
     * @deprecated import global `setEngine` method instead.
     */
    public useEngine(engine: Engine | null): void {
        setEngine(engine);
    }

    /**
     * @deprecated import global `closeEngineConnections` method instead.
     */
    public async closeConnections(): Promise<void> {
        await closeEngineConnections();
    }

    /**
     * @deprecated This has been removed entirely. If you need to, keep track of models in your own code because this
     * will be removed in an upcoming release.
     */
    public model(name: string): typeof Model {
        return this._bootedModels[name];
    }

    /**
     * @deprecated This is no longer necessary, models are loaded automatically now (even though you may still want to
     * boot them to avoid obfuscation).
     */
    public loadModel(name: string, model: typeof Model): void {
        model.boot(name);
    }

    /**
     * @deprecated This is no longer necessary, models are loaded automatically now (even though you may still want to
     * boot them to avoid obfuscation, use the global `bootModels` method instead).
     */
    public loadModels(models: Record<string, typeof Model>): void {
        for (const [name, model] of Object.entries(models)) {
            model.boot(name);

            models[name] = model;
        }
    }

}

/**
 * @deprecated import global methods instead.
 */
export default new Soukai();
