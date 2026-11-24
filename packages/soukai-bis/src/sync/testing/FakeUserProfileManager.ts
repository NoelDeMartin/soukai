import type { CompleteSolidUserProfile } from '@noeldemartin/solid-utils';
import type { SyncTypeIndexes, UserProfileManager } from 'soukai-bis/sync/SyncSession';
import { typeIndexWithRegistrations, user } from 'soukai-bis/sync/testing/helpers';
import { vi } from 'vite-plus/test';

export default class FakeUserProfileManager implements UserProfileManager {
    public profile: CompleteSolidUserProfile = user;
    public findTypeIndexes: () => Promise<SyncTypeIndexes>;
    public createPublicTypeIndex = vi.fn(async () => typeIndexWithRegistrations());
    public createPrivateTypeIndex = vi.fn(async () => typeIndexWithRegistrations());
    public onProfileUpdated = vi.fn();

    constructor(findTypeIndexes?: () => Promise<SyncTypeIndexes>) {
        this.findTypeIndexes = findTypeIndexes ?? (async () => ({ publicTypeIndexes: [], privateTypeIndexes: [] }));
    }

    public getProfile(): CompleteSolidUserProfile {
        return this.profile;
    }
}
