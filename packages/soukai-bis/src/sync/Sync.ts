import { ListenersManager, arrayFrom, facade, invade, once } from '@noeldemartin/utils';
import type { Listeners } from '@noeldemartin/utils';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { assertExternalSourceModelsBooted } from 'soukai-bis/jobs/sync/external-sources';
import { trackLocalChanges } from 'soukai-bis/models/local-changes';
import type { ModelConstructor } from 'soukai-bis/models/types';

import SyncSession from './SyncSession';
import type { SyncListener, SyncSessionConfig } from './SyncSession';

export interface SyncServiceListener extends SyncListener {
    onSessionStarted?(session: SyncSession): unknown;
    onSessionEnded?(session: SyncSession): unknown;
}

export class SyncService {
    private _session: SyncSession | null = null;
    private _listeners = new ListenersManager<SyncServiceListener>();

    public get session(): SyncSession | null {
        return this._session;
    }

    public get listeners(): Listeners<SyncServiceListener> {
        return this._listeners;
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

        const session = new SyncSession(config, this._listeners);
        const endSession = once(async () => {
            this._session === session && (this._session = null);

            await this._listeners.emit('onSessionEnded', session);
        });

        this._session = session;

        try {
            await this._listeners.emit('onSessionStarted', session);
            await invade(session, ['connect']).connect(endSession);
        } catch (error) {
            await session.disconnect();
            await endSession();

            throw error;
        }

        return session;
    }
}

export default facade(SyncService);
