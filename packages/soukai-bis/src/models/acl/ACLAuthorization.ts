import type { SolidDocumentPermission } from '@noeldemartin/solid-utils';
import { SolidDocumentPermissions } from '@noeldemartin/solid-utils';

import Model from './ACLAuthorization.schema';

const PERMISSION_MODES: Record<SolidDocumentPermission, string> = {
    [SolidDocumentPermissions.Read]: 'http://www.w3.org/ns/auth/acl#Read',
    [SolidDocumentPermissions.Write]: 'http://www.w3.org/ns/auth/acl#Write',
    [SolidDocumentPermissions.Append]: 'http://www.w3.org/ns/auth/acl#Append',
    [SolidDocumentPermissions.Control]: 'http://www.w3.org/ns/auth/acl#Control',
};

export default class ACLAuthorization extends Model {
    public static modeFromPermission(permission: SolidDocumentPermission): string {
        return PERMISSION_MODES[permission];
    }
}
