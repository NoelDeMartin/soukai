import { ListenersManager, facade } from '@noeldemartin/utils';
import { FakeEngineInstance } from 'soukai/testing';
import { FakeServer } from '@noeldemartin/testing';

import type { Fetch, SolidEngineListener } from 'soukai-solid/engines';

export class FakeSolidEngineInstance extends FakeEngineInstance {

    public __isSolidEngine = true;
    public listeners = new ListenersManager<SolidEngineListener>();

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
