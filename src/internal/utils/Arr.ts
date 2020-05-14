class Arr {

    public contains<T>(items: T[], item: T): boolean {
        return items.indexOf(item) !== -1;
    }

    public unique<T>(input: T[]): T[] {
        const set = new Set(input);
        const output: T[] = [];

        set.forEach(value => output.push(value));

        return output;
    }

}

export default new Arr();
