import SoukaiError from '@/errors/SoukaiError';

export default class extends SoukaiError {

    constructor(id: string) {
        super(`Document with id ${id} not found`);
    }

}
