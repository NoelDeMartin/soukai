import type { CompleteSolidUserProfile } from '@noeldemartin/solid-utils';
import type { UserProfileManager } from 'soukai-bis/sync/SyncSession';

export default class SyncProfileManager implements UserProfileManager {
    protected profile: CompleteSolidUserProfile;

    constructor(profile: CompleteSolidUserProfile) {
        this.profile = profile;
    }

    public getProfile(): CompleteSolidUserProfile {
        return this.profile;
    }
}
