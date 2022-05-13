import { mixed } from '@noeldemartin/utils';

export class Parent {

}

class MixinA {

    public doSomethingA(this: Child): void {
        this.doSomething();
        this.doSomethingA();
        this.doSomethingB();
    }

}

class MixinB {

    public doSomethingB(this: Child): void {
        this.doSomething();
        this.doSomethingA();
        this.doSomethingB();
    }

}

// More than mixins, maybe they should be called traits...
// I just want to split large files :)
export const Base = mixed(Parent, [MixinA, MixinB]);

export class Child extends Base {

    public doSomething(): void {
        this.doSomething();
        this.doSomethingA();
        this.doSomethingB();
    }

}
