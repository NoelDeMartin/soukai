import SoukaiError from './SoukaiError';

export default class NonAuthoritativeDocument extends SoukaiError {
    constructor(
        public readonly resourceUrl: string,
        public readonly sourceDocumentUrl: string,
        action: string = 'Writing',
    ) {
        super(
            `${action} models in non-authoritative documents is not supported ` +
                `('${resourceUrl}' was read from '${sourceDocumentUrl}')`,
        );
    }
}
