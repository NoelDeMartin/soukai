export default abstract class {

    public static title: string;

    public static run() {
        const suite = new (<any> this)();

        if (!suite.disabled) {
            for (const prop in suite) {
                if (typeof suite[prop] === 'function' && prop.startsWith('test')) {
                    let name = prop.substr(4).replace(/([A-Z])/g, ' $1').trim();
                    if (this.title) {
                        name = `[${this.title}] ` + name;
                    }
                    test(name, () => {
                        return Promise.resolve()
                            .then(() => suite.setUp())
                            .then(() => suite[prop]())
                            .then(() => suite.tearDown());
                    });
                }
            }
        }
    }

    public disabled: boolean = false;

    public setUp(): void {
        //
    }

    public tearDown(): void {
        //
    }

}
