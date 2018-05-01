export default class extends Error {

    constructor(name: string, message: string) {
        super(`Model ${name}: ${message}`);
    }

}
