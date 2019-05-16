import SoukaiError from '@/errors/SoukaiError';

export default class InvalidModelDefinition extends SoukaiError {

    constructor(name: string, message: string) {
        super(
            `Model ${name}: ${message}. ` +
            'Learn more at https://soukai.js.org/guide.html#fields-definition',
        );
    }

}
