import Model from '@/models/Model';
import Relation from '@/models/relations/Relation';

export default abstract class SingleModelRelation<
    P extends Model = Model,
    R extends Model = Model,
    RC extends typeof Model = typeof Model,
> extends Relation<P, R, RC> {

    public abstract resolve(): Promise<null | R>;

}
