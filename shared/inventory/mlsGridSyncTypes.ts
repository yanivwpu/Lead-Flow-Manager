/** Backward-compatible re-exports — prefer `@shared/inventory/reso/resoSyncTypes`. */
export {
  type ResoSyncMode,
  type InventorySyncMode,
  type ResoSyncCursor,
  type MlsGridSyncCursor,
  type ResoSyncDiagnostics,
  type MlsGridSyncDiagnostics,
  resoSyncCursorSchema,
  resoSyncCursorSchema as mlsGridSyncCursorSchema,
  readResoSyncCursor,
  readResoSyncCursor as readMlsGridSyncCursor,
  mergeResoSyncCursor,
  mergeResoSyncCursor as mergeMlsGridSyncCursor,
  maxTimestampFromRows,
  maxModificationTimestampFromRows,
} from "./reso/resoSyncTypes";
