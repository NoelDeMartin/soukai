import { IndexedDBMap } from '@noeldemartin/utils';
import type { Engine, EngineDocument } from 'soukai';

export default class DocumentsCache {

    private engine: Engine;
    private metadata: IndexedDBMap<{ modifiedAt: number }>;
    private active: Partial<Record<string, boolean>> = {};

    constructor(name: string, engine: Engine) {
        this.engine = engine;
        this.metadata = new IndexedDBMap(`${name}-documents-cache`);
    }

    public has(collection: string, id: string): boolean {
        return !!this.active[this.getDocumentKey(collection, id)];
    }

    public get(collection: string, id: string): Promise<EngineDocument | null> {
        return this.engine.readOne(collection, id);
    }

    public async remember(collection: string, id: string, modifiedAt: number | Date): Promise<void> {
        await this.metadata.set(this.getDocumentKey(collection, id), {
            modifiedAt: typeof modifiedAt === 'number' ? modifiedAt : modifiedAt.getTime(),
        });
    }

    public async forget(collection: string, id: string): Promise<void> {
        await this.metadata.delete(this.getDocumentKey(collection, id));
    }

    public async activate(collection: string, id: string, modifiedAt: number): Promise<void> {
        const meta = await this.metadata.get(this.getDocumentKey(collection, id));

        this.active[this.getDocumentKey(collection, id)] = !!meta?.modifiedAt && meta.modifiedAt >= modifiedAt;
    }

    private getDocumentKey(collection: string, id: string): string {
        return `${collection}-${id}`;
    }

}
