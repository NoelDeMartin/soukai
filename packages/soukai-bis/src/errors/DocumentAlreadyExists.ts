import type { SolidDocument } from '@noeldemartin/solid-utils';

import SoukaiError from './SoukaiError';

export default class DocumentAlreadyExists extends SoukaiError {

    public readonly url: string;
    public readonly document?: SolidDocument;

    constructor(url: string, document?: SolidDocument) {
        super(`Could not create document with url '${url}' because it is already in use.`);

        this.url = url;
        this.document = document;
    }

}
