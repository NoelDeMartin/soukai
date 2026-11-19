import SoukaiError from './SoukaiError';

export default class FileAlreadyExists extends SoukaiError {
    constructor(public readonly url: string) {
        super(`Could not create file with url '${url}' because it is already in use.`);
    }
}
