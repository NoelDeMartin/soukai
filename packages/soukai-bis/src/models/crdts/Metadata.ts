import type { MintUrlOptions } from 'soukai-bis/models/Model';

import Model from './Metadata.schema';
import { getMetadataUrl } from './soft-deletes';

export default class Metadata extends Model {
    protected newUrl(options: MintUrlOptions = {}): string {
        if (!this.resourceUrl) {
            return super.newUrl(options);
        }

        return getMetadataUrl(this.resourceUrl);
    }
}
