import SoukaiError from '@/lib/errors/SoukaiError';

import { Database } from '@/lib/Engine';

export default class extends SoukaiError {

    constructor(id: Database.Key) {
        super(`Document with id ${id} not found`);
    }

}
