import SoukaiError from './SoukaiError';

export default class PreconditionFailed extends SoukaiError {
    constructor(
        action: 'deleting',
        public readonly url: string,
    ) {
        super(`Precondition failed ${action} document '${url}'`);
    }
}
