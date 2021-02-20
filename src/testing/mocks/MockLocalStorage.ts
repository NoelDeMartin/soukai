class MockLocalStorage implements Storage {

    private data: { [key: string]: string } = {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [name: string]: any;

    get length(): number {
        return Object.keys(this.data).length;
    }

    public setData(data: { [key: string]: string }): void {
        this.data = data;
    }

    public reset(): void {
        this.data = {};

        (this.clear as jest.Mock).mockClear();
        (this.getItem as jest.Mock).mockClear();
        (this.removeItem as jest.Mock).mockClear();
        (this.setItem as jest.Mock).mockClear();
        (this.key as jest.Mock).mockClear();
    }

    public clear(): void {
        this.data = {};
    }

    public getItem(key: string): string | null {
        return key in this.data ? this.data[key] : null;
    }

    public removeItem(key: string): void {
        if (key in this.data) {
            delete this.data[key];
        }
    }

    public setItem(key: string, value: string): void {
        this.data[key] = value;
    }

    public key(index: number): string | null {
        const keys = Object.keys(this.data);

        return keys.length >= index ? null : keys[index];
    }

}

const instance = new MockLocalStorage();

jest.spyOn(instance, 'clear');
jest.spyOn(instance, 'getItem');
jest.spyOn(instance, 'removeItem');
jest.spyOn(instance, 'setItem');
jest.spyOn(instance, 'key');

export default instance;
