import SoukaiError from '@/lib/errors/SoukaiError';

import * as Database from '@/lib/Database';

export default class extends SoukaiError {

    constructor(id: Database.Key) {
        super(`Document with id ${id} not found`);
    }

}
