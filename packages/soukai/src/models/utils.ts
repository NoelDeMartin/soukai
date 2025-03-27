import { tap } from '@noeldemartin/utils';
import type { ClosureArgs } from '@noeldemartin/utils';

import type { Engine } from 'soukai/engines/Engine';

const originalEngines: WeakMap<object, [Engine | undefined, number]> = new WeakMap();

export interface EngineTarget {
    setEngine(engine?: Engine): void;
}

export function withEngineImpl<TResult, TTarget extends EngineTarget>(options: {
    target: TTarget;
    engine: Engine;
    getTargetEngine: () => Engine | undefined;
    operation?: () => TResult | Promise<TResult>;
}): Promise<TResult> | TResult | TTarget {
    // It is necessary to keep the replacements count to avoid race conditions when multiple
    // operations are running concurrently with Promise.all()
    const target = options.target;
    const [originalEngine, replacementsCount] = originalEngines.get(target) ?? [options.getTargetEngine(), 0];
    const restoreOriginalEngine = () => {
        const [_originalEngine, _replacementsCount] = originalEngines.get(target) as [Engine | undefined, number];

        if (_replacementsCount > 1) {
            originalEngines.set(target, [_originalEngine, _replacementsCount - 1]);

            return;
        }

        originalEngines.delete(target);
        target.setEngine(_originalEngine);
    };
    const executeOperation = (operation: () => TResult | Promise<TResult>): TResult | Promise<TResult> => {
        const result = operation();

        return result instanceof Promise
            ? result.then(() => tap(result, () => restoreOriginalEngine()))
            : tap(result, () => restoreOriginalEngine());
    };

    originalEngines.set(target, [originalEngine, replacementsCount + 1]);
    target.setEngine(options.engine);

    if (!options.operation) {
        return new Proxy(target, {
            get(_target, propertyKey, receiver) {
                const originalProperty = Reflect.get(_target, propertyKey, receiver);

                if (typeof originalProperty !== 'function') {
                    restoreOriginalEngine();

                    return originalProperty;
                }

                return (...args: ClosureArgs) => executeOperation(() => originalProperty.call(_target, ...args));
            },
        });
    }

    return executeOperation(options.operation);
}
