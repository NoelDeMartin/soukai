import type { Relation } from 'soukai';

import type { SolidBelongsToManyRelation } from 'soukai-solid/models';

import Model from './Recipe.schema';
import RecipeInstructionsStep from './RecipeInstructionsStep';

export default class Recipe extends Model {

    declare public instructionsSteps?: RecipeInstructionsStep[];
    declare public relatedInstructionsSteps: SolidBelongsToManyRelation<
        Recipe,
        RecipeInstructionsStep,
        typeof RecipeInstructionsStep
    >;

    public instructionsStepsRelationship(): Relation {
        return this.belongsToMany(RecipeInstructionsStep, 'instructionsStepUrls')
            .usingSameDocument(true)
            .onDelete('cascade');
    }

}
