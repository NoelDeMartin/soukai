import SoukaiError from './SoukaiError';

export default class extends SoukaiError {

    constructor(id: Soukai.PrimaryKey) {
        super(`Document with id ${id} not found`);
    }

}
