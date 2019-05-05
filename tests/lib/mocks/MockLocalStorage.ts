class MockLocalStorage implements Storage {

    private data: { [key: string]: string } = {};

    [name: string]: any;

    get length(): number {
        return Object.keys(this.data).length;
    }

    public setData(data: { [key: string]: string }): void {
        this.data = data;
    }

    public reset(): void {
        this.data = {};

        (this.clear as any).mockClear();
        (this.getItem as any).mockClear();
        (this.removeItem as any).mockClear();
        (this.setItem as any).mockClear();
        (this.key as any).mockClear();
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
