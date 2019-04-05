import Model from '@/models/Model';
import Relation from '@/models/relations/Relation';

export default abstract class SingleModelRelation extends Relation {

    public abstract resolve(): Promise<null | Model>;

}
