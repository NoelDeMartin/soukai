import type { EngineMetadata } from '../Engine';

export interface GetDocumentUrlsOptions {
    metadata?: EngineMetadata;
}

export default interface ManagesDocuments {
    getDocumentUrls(options?: GetDocumentUrlsOptions): Promise<string[]>;
}
