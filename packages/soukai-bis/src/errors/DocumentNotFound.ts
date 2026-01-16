import SoukaiError from './SoukaiError';

export default class DocumentNotFound extends SoukaiError {

    constructor(public readonly url: string) {
        super(`Couldn't find document '${url}'`);
    }

}
