import { SolidDocumentPermission } from '@noeldemartin/solid-utils';
import type { Fetch } from '@noeldemartin/solid-utils';

import Model from './SolidACLAuthorization.schema';

const PERMISSION_MODES: Record<SolidDocumentPermission, string> = {
    [SolidDocumentPermission.Read]: 'http://www.w3.org/ns/auth/acl#Read',
    [SolidDocumentPermission.Write]: 'http://www.w3.org/ns/auth/acl#Write',
    [SolidDocumentPermission.Append]: 'http://www.w3.org/ns/auth/acl#Append',
    [SolidDocumentPermission.Control]: 'http://www.w3.org/ns/auth/acl#Control',
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
