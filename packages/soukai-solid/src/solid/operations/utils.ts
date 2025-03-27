import { arrayFilter } from '@noeldemartin/utils';

import type RDFResourceProperty from 'soukai-solid/solid/RDFResourceProperty';

import { OperationTypes } from './Operation';
import type ChangeUrlOperation from './ChangeUrlOperation';
import type RemovePropertyOperation from './RemovePropertyOperation';
import type ShieldPropertyOperation from './ShieldPropertyOperation';
import type UpdatePropertyOperation from './UpdatePropertyOperation';
import type { UpdateOperation } from './Operation';

interface DecantedUpdateOperations {
    [OperationTypes.UpdateProperty]: UpdatePropertyOperation[];
    [OperationTypes.RemoveProperty]: RemovePropertyOperation[];
    [OperationTypes.ChangeUrl]: ChangeUrlOperation[];
    [OperationTypes.ShieldProperty]: ShieldPropertyOperation[];
}

type DecantedUpdateOperationsData = [
    (RDFResourceProperty | RDFResourceProperty[])[],
    [string, string | string[] | undefined, unknown?][],
];

export function decantUpdateOperations(operations: UpdateOperation[]): DecantedUpdateOperations {
    return operations.reduce(
        (decantedOperations, operation) => {
            decantedOperations[operation.type].push(operation as never);

            return decantedOperations;
        },
        {
            [OperationTypes.ChangeUrl]: [],
            [OperationTypes.RemoveProperty]: [],
            [OperationTypes.ShieldProperty]: [],
            [OperationTypes.UpdateProperty]: [],
        } as DecantedUpdateOperations,
    );
}

export function decantUpdateOperationsData(operations: UpdateOperation[]): DecantedUpdateOperationsData {
    const shielded = operations
        .filter((operation) => operation.type === OperationTypes.ShieldProperty)
        .reduce(
            (shields, operation) => {
                const shieldOperation = operation as ShieldPropertyOperation;

                shields[shieldOperation.resourceUrl] ??= [];
                shields[shieldOperation.resourceUrl]?.push(shieldOperation.property);

                return shields;
            },
            {} as Record<string, string[]>,
        );

    return operations.reduce(
        (data, operation) => {
            switch (operation.type) {
                case OperationTypes.UpdateProperty:
                    data[0].push(operation.propertyOrProperties);
                    break;
                case OperationTypes.RemoveProperty:
                    if (!shielded[operation.resourceUrl]) {
                        data[1].push(
                            arrayFilter([operation.resourceUrl, operation.property, operation.value]) as [
                                string,
                                string | string[] | undefined,
                                unknown?,
                            ],
                        );

                        break;
                    }

                    if (!operation.property) {
                        data[1].push(
                            arrayFilter([operation.resourceUrl, shielded[operation.resourceUrl]]) as [
                                string,
                                string | string[] | undefined,
                                unknown?,
                            ],
                        );

                        break;
                    }

                    if (shielded[operation.resourceUrl]?.includes(operation.property)) {
                        break;
                    }

                    data[1].push(
                        arrayFilter([operation.resourceUrl, operation.property, operation.value]) as [
                            string,
                            string | string[] | undefined,
                            unknown?,
                        ],
                    );

                    break;
            }

            return data;
        },
        [[], []] as DecantedUpdateOperationsData,
    );
}
