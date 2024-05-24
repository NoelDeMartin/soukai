import type { Engine, EngineDocument, EngineDocumentsCollection, EngineFilters, EngineUpdates } from '@/engines/Engine';

export function isProxyEngine(engine: Engine): engine is Engine & IProxyEngine {
    return engine instanceof ProxyEngine || 'getProxySubject' in engine;
}

/**
 * @deprecated Use ProxyEngine class instead.
 */
export interface IProxyEngine {

    getProxySubject(): Engine;

}

export class ProxyEngine<SubjectEngine extends Engine = Engine> implements Engine, IProxyEngine {

    public readonly subject: SubjectEngine;
    private overrides: Engine;

    constructor(subject: SubjectEngine, overrides: Partial<Engine> = {}) {
        this.subject = subject;
        this.overrides = {
            create: (...args) => subject.create(...args),
            readOne: (...args) => subject.readOne(...args),
            readMany: (...args) => subject.readMany(...args),
            update: (...args) => subject.update(...args),
            delete: (...args) => subject.delete(...args),
            ...overrides,
        };
    }

    public getProxySubject(): Engine {
        return this.subject;
    }

    public async create(collection: string, document: EngineDocument, id?: string): Promise<string> {
        return this.overrides.create(collection, document, id);
    }

    public async readOne(collection: string, id: string): Promise<EngineDocument> {
        return this.overrides.readOne(collection, id);
    }

    public async readMany(collection: string, filters?: EngineFilters): Promise<EngineDocumentsCollection> {
        return this.overrides.readMany(collection, filters);
    }

    public async update(collection: string, id: string, updates: EngineUpdates): Promise<void> {
        return this.overrides.update(collection, id, updates);
    }

    public async delete(collection: string, id: string): Promise<void> {
        return this.overrides.delete(collection, id);
    }

}
