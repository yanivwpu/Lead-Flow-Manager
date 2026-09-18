/** Seven bound values per snapshot means 5,000 rows stays well below PostgreSQL's
 * 65,535-parameter extended-query limit, with room for ORM-added parameters. */
export const SEO_SNAPSHOT_INSERT_BATCH_SIZE = 5_000;

export function snapshotInsertBatches<T>(rows: readonly T[], size = SEO_SNAPSHOT_INSERT_BATCH_SIZE): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error("Snapshot batch size must be a positive integer");
  const batches: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += size) batches.push(rows.slice(offset, offset + size));
  return batches;
}
