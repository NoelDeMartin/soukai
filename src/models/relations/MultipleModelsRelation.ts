import Model from '@/models/Model';
import Relation from '@/models/relations/Relation';

export default abstract class MultipleModelsRelation extends Relation {

    public abstract resolve(): Promise<Model[]>;

}
