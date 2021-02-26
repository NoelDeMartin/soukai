import SoukaiError from '@/errors/SoukaiError';

export default class DocumentNotFound extends SoukaiError {

    public readonly id: string;
    public readonly collection?: string;

    constructor(id: string, collection?: string) {
        super(
            collection
                ? `Couldn't find document with id '${id}' in '${collection}' Collection.`
                : `Couldn't find document with id '${id}'`,
        );

        this.id = id;
        this.collection = collection;
    }

}
