import type { JsonLDGraph } from '@noeldemartin/solid-utils';

export interface DocumentContainsRelation {
    __loadDocumentModels(documentUrl: string, document: JsonLDGraph): Promise<void>;
}
