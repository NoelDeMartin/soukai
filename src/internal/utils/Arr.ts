class Arr {

    public unique<T>(input: T[]): T[] {
        const set = new Set(input);
        const output: T[] = [];

        set.forEach(value => output.push(value));

        return output;
    }

}

export default new Arr();
