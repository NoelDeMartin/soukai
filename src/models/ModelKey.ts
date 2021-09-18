export default class ModelKey {

    private value: string;

    constructor(rawValue: unknown) {
        this.value = String(rawValue);
    }

    public equals(other: ModelKey): boolean {
        return this.value === other.value;
    }

    public toString(): string {
        return this.value;
    }

}
