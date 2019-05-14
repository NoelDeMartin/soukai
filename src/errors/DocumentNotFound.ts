import SoukaiError from '@/errors/SoukaiError';

export default class DocumentNotFound extends SoukaiError {

    constructor(id: string) {
        super(`Document with id ${id} not found`);
    }

}
