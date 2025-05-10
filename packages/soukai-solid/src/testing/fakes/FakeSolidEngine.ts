import { ListenersManager, facade } from '@noeldemartin/utils';
import { normalizeJsonLD } from '@noeldemartin/solid-utils';
import { FakeEngineInstance } from 'soukai/testing';
import { FakeServer } from '@noeldemartin/testing';
import type { EngineDocument } from 'soukai';

import type { Fetch, SolidEngineListener } from 'soukai-solid/engines';

export class FakeSolidEngineInstance extends FakeEngineInstance {

    public __isSolidEngine = true;
    public listeners = new ListenersManager<SolidEngineListener>();

    public async create(collectionName: string, document: EngineDocument, id?: string): Promise<string> {
        const normalized = (await normalizeJsonLD(document, id)) as EngineDocument;

        return super.create(collectionName, normalized, id);
    }

    public setConfig(): void {
        // Nothing to do here.
    }

    public getFetch(): Fetch {
        return FakeServer.fetch;
    }

    public clearCache(): void {
        // Nothing to do here.
    }

}

export default facade(FakeSolidEngineInstance);
