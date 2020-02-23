import SoukaiError from '@/errors/SoukaiError';

export default class DocumentNotFound extends SoukaiError {

    public readonly id: string;

    constructor(id: string) {
        super(`Couldn't find document with id ${id}.`);

        this.id = id;
    }

}
