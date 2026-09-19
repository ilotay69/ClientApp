/** Read a complete authorized snapshot, not just PostgREST's default first page.
 * Callers supply an RLS-scoped query with a deterministic order and unique ID tie-breaker.
 * Never return a partial list as a successful total if a later page fails. */
export async function readDashboardSnapshot<Row, Error>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: Row[] | null; error: Error | null }>,
): Promise<{ data: Row[] | null; error: Error | null }> {
  const rows: Row[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const result = await page(offset, offset + pageSize - 1);
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < pageSize)
      return { data: rows, error: null };
  }
}
