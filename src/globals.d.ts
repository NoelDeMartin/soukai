import '';

declare global {
    type MapObject<T> = { [attribute: string]: T };
}
