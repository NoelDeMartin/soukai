import SoukaiError from '@/errors/SoukaiError';

export default class DocumentAlreadyExists extends SoukaiError {

    public readonly id: string;

    constructor(id: string) {
        super(`Could not create document with id ${id} because it is already in use.`);

        this.id = id;
    }

}
