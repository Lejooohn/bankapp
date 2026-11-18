// Retries a start-up step until it succeeds. Used at boot so that a database that
// is still starting (or restarted later) does not leave the API down: the dev
// server keeps running after a failed boot, so the process would never exit
// and the container would never recover on its own.
export async function retryUntilSuccess<T>(
  step: () => Promise<T>,
  delayMs: number,
  onError: (err: unknown, attempt: number) => void
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await step();
    } catch (err) {
      onError(err, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
