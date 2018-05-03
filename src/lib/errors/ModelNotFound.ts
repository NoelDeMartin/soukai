import SoukaiError from './SoukaiError';

export default class extends SoukaiError {

    constructor(id: Soukai.PrimaryKey) {
        super(`Model with id ${id} not found`);
    }

}
