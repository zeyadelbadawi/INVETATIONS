// PostgREST carries `in` filters in the query string; long id lists overflow the
// URL. Run the query per batch of ids and concatenate the rows.
export const ID_BATCH = 50;

export async function inBatches<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += ID_BATCH) {
    const { data, error } = await run(ids.slice(i, i + ID_BATCH));
    if (error) throw new Error(`${label} failed: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}
