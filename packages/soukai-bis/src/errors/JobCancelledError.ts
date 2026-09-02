import SoukaiError from './SoukaiError';

export default class JobCancelledError extends SoukaiError {

    public constructor(public readonly result: unknown) {
        super('Job cancelled');
    }

}
