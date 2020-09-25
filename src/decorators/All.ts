import Model from '@/models/Model';

/**
 * This is a decorator to implement the static method Model.all
 *  But, as a decorator does not directly change the type of the class, only its content,
 *  the method needs to be declared to be able to take advantage of the IDE's auto complete.
 * @param constructorFn constructor of the class, it's automatically injected by TypeScript
 * @example // @All
 * Class ARandomClass extends Model {
 *      public static all: any
 * }
 */
export function All(constructorFn: Function) {
    const key = 'all';
    constructorFn[key] = Model.all;
}