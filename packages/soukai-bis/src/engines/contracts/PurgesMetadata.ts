export interface PurgesMetadataOptions {
    documentUrls?: string[];
}

export default interface PurgesMetadata {
    purgeMetadata(options?: PurgesMetadataOptions): Promise<void>;
}
