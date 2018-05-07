import SoukaiError from '@/lib/errors/SoukaiError';

export default class extends SoukaiError {

    constructor(name: string, message: string) {
        super(`Model ${name}: ${message}`);
    }

}
