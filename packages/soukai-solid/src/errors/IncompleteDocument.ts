import { SoukaiError } from 'soukai';

export default class IncompleteDocument extends SoukaiError {

    constructor(documentUrl: string) {
        super(`Some required attributes were missing from '${documentUrl}' document.`);
    }

}
