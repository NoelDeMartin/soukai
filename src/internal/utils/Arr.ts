class Arr {

    public contains<T>(items: T[], item: T): boolean {
        return items.indexOf(item) !== -1;
    }

    public flatten<T>(arr: T[][]): T[] {
        if ('flat' in arr) {
            return (arr as any).flat();
        }

        return [].concat(...arr as any);
    }

    public unique<T>(input: T[]): T[] {
        const set = new Set(input);
        const output: T[] = [];

        set.forEach(value => output.push(value));

        return output;
    }

    public withoutIndexes<T>(items: T[], indexes: number[]): T[] {
        return items
            .map((value, index) => ([value, index] as [T, number]))
            .filter(([_, index]) => !this.contains(indexes, index))
            .map(([value]) => value);
    }

}

export default new Arr();
