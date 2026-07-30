export class DeadlineExceededError extends Error {
  constructor(
    readonly label: string,
    readonly timeoutMs: number,
  ) {
    super(`${label} exceeded its ${timeoutMs}ms deadline`);
    this.name = "DeadlineExceededError";
  }
}

/**
 * Rejects with DeadlineExceededError if `promise` has not settled in time.
 *
 * NOTE: this bounds how long the caller waits, not the underlying work. The
 * ADK runner exposes no AbortSignal, so a timed-out Gemini call keeps running
 * until it finishes on its own or the serverless function is torn down. That
 * is still worth doing: without it a single unresponsive call blocks the
 * entire report until the platform kills the request.
 */
export function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  if (timeoutMs <= 0) {
    return Promise.reject(new DeadlineExceededError(label, timeoutMs));
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new DeadlineExceededError(label, timeoutMs)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}
