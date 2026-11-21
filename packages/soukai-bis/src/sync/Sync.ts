import { arrayFrom, facade, invade } from '@noeldemartin/utils';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { assertExternalSourceModelsBooted } from 'soukai-bis/jobs/sync/external-sources';
import { trackLocalChanges } from 'soukai-bis/models/local-changes';
import type { ModelConstructor } from 'soukai-bis/models/types';

import SyncSession from './SyncSession';
import type { SyncSessionConfig } from './SyncSession';

export class SyncService {
    private _session: SyncSession | null = null;

    public get session(): SyncSession | null {
        return this._session;
    }

    public trackLocalChanges(models: ModelConstructor | ModelConstructor[]): void {
        arrayFrom(models).forEach((model) => trackLocalChanges(model));
    }

    public async connect(config: SyncSessionConfig): Promise<SyncSession> {
        if (this.session) {
            throw new SoukaiError(
                "Sync already has a running session, call its disconnect() method and wait until it's done first",
            );
        }

        config.externalSources?.forEach((source) => assertExternalSourceModelsBooted(source));

        const session = new SyncSession(config);

        this._session = session;

        try {
            await invade(session, ['connect']).connect(() => this._session === session && (this._session = null));
        } catch (error) {
            await session.disconnect();

            throw error;
        }

        return session;
    }
}

export default facade(SyncService);
