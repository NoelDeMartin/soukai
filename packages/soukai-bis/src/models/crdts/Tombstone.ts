import type { MintUrlOptions } from 'soukai-bis/models/Model';

import Model from './Tombstone.schema';

export default class Tombstone extends Model {

    protected newUrl(options: MintUrlOptions = {}): string {
        if (!this.resourceUrl) {
            return super.newUrl(options);
        }

        return this.resourceUrl.includes('#') ? `${this.resourceUrl}-tombstone` : `${this.resourceUrl}#tombstone`;
    }

}
