import { SoukaiError } from 'soukai';

export default class ResourceNotFound extends SoukaiError {

    constructor(resourceId: string, documentUrl?: string) {
        super(
            documentUrl
                ? `Couldn't find resource with id '${resourceId}' in '${documentUrl}' document.`
                : `Couldn't find resource with id '${resourceId}' in document.`,
        );
    }

}
