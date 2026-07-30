// Runs `task` over every item with at most `limit` in flight at once.
// Results keep the input order regardless of completion order.
//
// A plain Promise.all over the question list fires one Gemini request per
// question simultaneously; a 30-minute interview produces enough questions to
// hit the API rate limit and fail the whole report.
export async function mapWithConcurrency<T, R>(
  items: ReadonlyArray<T>,
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (limit < 1) throw new Error("mapWithConcurrency: limit must be at least 1");

  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
