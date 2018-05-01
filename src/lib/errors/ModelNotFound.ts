export default class extends Error {

    constructor(id: Soukai.PrimaryKey) {
        super(`Model with id ${id} not found`);
    }

}
