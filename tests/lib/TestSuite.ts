export default abstract class {

    static title: string;

    public static run() {
        const suite = new (<any> this)();

        for (const prop in suite) {
            if (typeof suite[prop] === 'function' && prop.startsWith('test')) {
                let name = prop.substr(4).replace(/([A-Z])/g, ' $1').trim();
                if (this.title) {
                    name = `[${this.title}] ` + name;
                }
                test(name, () => {
                    suite.setUp();
                    suite[prop]();
                    suite.tearDown();
                });
            }
        }
    }

    public setUp(): void {}

    public tearDown(): void {}

}
