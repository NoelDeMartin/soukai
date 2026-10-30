import { SolidDocumentPermissions } from '@noeldemartin/solid-utils';
import type { Fetch, SolidDocumentPermission } from '@noeldemartin/solid-utils';

import Model from './SolidACLAuthorization.schema';

const PERMISSION_MODES: Record<SolidDocumentPermission, string> = {
    [SolidDocumentPermissions.Read]: 'http://www.w3.org/ns/auth/acl#Read',
    [SolidDocumentPermissions.Write]: 'http://www.w3.org/ns/auth/acl#Write',
    [SolidDocumentPermissions.Append]: 'http://www.w3.org/ns/auth/acl#Append',
    [SolidDocumentPermissions.Control]: 'http://www.w3.org/ns/auth/acl#Control',
};

export default class SolidACLAuthorization extends Model {
    /**
     * @deprecated Use requireFetch() instead.
     */
    public static get fetch(): Fetch {
        return this.requireFetch();
    }

    public static modeFromSolidDocumentPermission(permission: SolidDocumentPermission): string {
        return PERMISSION_MODES[permission];
    }
}
