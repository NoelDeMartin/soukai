import { Key } from '@/models/Model';

import SoukaiError from '@/errors/SoukaiError';

export default class extends SoukaiError {

    constructor(id: Key) {
        super(`Document with id ${id} not found`);
    }

}
