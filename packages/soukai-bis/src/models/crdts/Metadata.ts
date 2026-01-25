import type { MintUrlOptions } from 'soukai-bis/models/Model';

import Model from './Metadata.schema';

export default class Metadata extends Model {

    protected newUrl(options: MintUrlOptions = {}): string {
        if (!this.resourceUrl) {
            return super.newUrl(options);
        }

        return this.resourceUrl.includes('#') ? `${this.resourceUrl}-metadata` : `${this.resourceUrl}#metadata`;
    }

}
