export type Expect<T extends true> = T;
export type Assert<T> = T extends undefined ? never : T;
export type Extends<X, Y> = Y extends X ? true : false;
export type Equals<X, Y> =
     (<T>() => T extends X ? 1 : 2) extends
    (<T>() => T extends Y ? 1 : 2) ? true : false;
