import { isCreatedLocalChange } from 'soukai-bis/engines/local-changes';
import type { LocalFile, ResourceLocalChanges } from 'soukai-bis/engines/LocalEngine';
import type { ModelConstructor } from 'soukai-bis/models/types';

export const FilesSyncStrategies = {
    Document: 'document',
    Container: 'container',
} as const;

export type FilesSyncStrategy = (typeof FilesSyncStrategies)[keyof typeof FilesSyncStrategies];

export interface SyncFilesConfig {
    strategy: FilesSyncStrategy;
    fields?: string[];
    availableOffline?: boolean;
}

export interface SyncFilesModel {
    model: ModelConstructor;
    files: SyncFilesConfig[];
}

export interface FilePushedEvent {
    url: string;
    blob: Blob;
}

export type FileConflictType = 'file-modified' | 'file-deleted-remotely' | 'file-deleted-locally';

export type FileConflictResolution = 'keep-local' | 'keep-remote';

export interface FileConflict {
    type: FileConflictType;
    url: string;
    localFile: LocalFile;
    remoteUpdatedAt: Date | null;
}

export interface RemoteFile {
    url: string;
    mimeType?: string;
    updatedAt?: Date;
}

export interface PulledFiles {
    url: string;
    localFiles: LocalFile[];
    updatedFiles: RemoteFile[];
    deletedFiles: LocalFile[];
    lastModifiedAt?: Date | null;
}

export function isSameTimestamp(
    localDate: Date | null | undefined,
    remoteDate: Date | null | undefined,
    tolerance: number,
): boolean {
    if (!localDate || !remoteDate) {
        return !localDate && !remoteDate;
    }

    return Math.abs(localDate.getTime() - remoteDate.getTime()) <= tolerance;
}

export function isFileUpToDate(localFile: LocalFile, remoteFile: RemoteFile, tolerance: number): boolean {
    const mimeTypeMatches = !remoteFile.mimeType || localFile.mimeType === remoteFile.mimeType;
    const updatedAtMatches =
        !remoteFile.updatedAt || isSameTimestamp(localFile.lastModifiedAt, remoteFile.updatedAt, tolerance);

    return mimeTypeMatches && updatedAtMatches;
}

export function getFileConflictType(
    localFile: LocalFile,
    remoteFile: RemoteFile,
    localChanges: ResourceLocalChanges | undefined,
    tolerance: number,
): FileConflictType | null {
    if (!localFile.lastModifiedAt) {
        return !localFile.deleted && isCreatedLocalChange(localChanges) ? 'file-modified' : null;
    }

    if (!remoteFile.updatedAt || isSameTimestamp(localFile.lastModifiedAt, remoteFile.updatedAt, tolerance)) {
        return null;
    }

    return localFile.deleted ? 'file-deleted-locally' : 'file-modified';
}
