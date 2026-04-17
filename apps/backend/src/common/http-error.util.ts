export function httpErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export function isRetryableHttpError(
  err: unknown,
  retryableErrorList: readonly string[],
): boolean {
  const msg = httpErrorMessage(err).toLowerCase();
  return retryableErrorList.some(snippet => msg.includes(snippet.toLowerCase()));
}
