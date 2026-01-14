import SoukaiError from './SoukaiError';

export default class DocumentAlreadyExists extends SoukaiError {

    public readonly url: string;

    constructor(url: string) {
        super(`Could not create document with url '${url}' because it is already in use.`);

        this.url = url;
    }

}
