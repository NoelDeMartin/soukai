import SoukaiError from '@/errors/SoukaiError';

export default class DocumentNotFound extends SoukaiError {

    constructor(id: string) {
        super(`Couldn't find document with id ${id}.`);
    }

}
