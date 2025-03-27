export default class ModelKey {

    public static from(value: unknown): ModelKey {
        if (value instanceof ModelKey) {
            return value;
        }

        return new ModelKey(value);
    }

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
