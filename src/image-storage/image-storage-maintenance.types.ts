export interface ImageStorageSnapshot {
  usedBytes: number;
  capacityBytes: number;
  fileCount: number;
  namespace: 'production' | 'development';
  namespaceUsedBytes: number;
  namespaceFileCount: number;
  purgeEnabled: boolean;
  staleBytes: number;
  staleFileCount: number;
  gracePeriodHours: number;
  checkedAt: string;
}

export interface ImagePurgeResult {
  deletedBytes: number;
  deletedFileCount: number;
  failedFileCount: number;
  completedAt: string;
}
