import type { MintUrlOptions } from 'soukai-bis';

import Model from './InverseEpisode.schema';

export default class InverseEpisode extends Model {
    protected newUrlDocumentUrl(options: MintUrlOptions = {}): string {
        if (!this.season?.getDocumentUrl()) {
            return super.newUrlDocumentUrl(options);
        }

        return this.season.getDocumentUrl() + '-episode';
    }
}
