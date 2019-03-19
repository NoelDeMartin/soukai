import { Key } from '@/lib/Model';
import SoukaiError from '@/lib/errors/SoukaiError';

export default class extends SoukaiError {

    constructor(id: Key) {
        super(`Document with id ${id} not found`);
    }

}
