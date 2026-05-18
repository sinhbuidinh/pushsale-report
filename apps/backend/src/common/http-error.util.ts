import { isAxiosError, type AxiosError } from 'axios';

export function httpErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

/** Meta Marketing / Graph API error object on failed responses. */
type MetaGraphErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

/**
 * Human-readable message from a failed Meta Graph call (axios),
 * falling back to {@link httpErrorMessage}.
 */
export function metaGraphApiErrorMessage(err: unknown): string {
  if (!isAxiosError(err)) {
    return httpErrorMessage(err);
  }
  const ax = err as AxiosError<MetaGraphErrorBody>;
  const metaErr = ax.response?.data?.error;
  const httpStatus = ax.response?.status;
  if (metaErr?.message) {
    const parts = [
      `Meta Graph API${httpStatus != null ? ` HTTP ${httpStatus}` : ''}: ${metaErr.message}`,
    ];
    if (metaErr.code != null) {
      parts.push(`code=${metaErr.code}`);
    }
    if (metaErr.error_subcode != null) {
      parts.push(`subcode=${metaErr.error_subcode}`);
    }
    if (metaErr.type) {
      parts.push(`type=${metaErr.type}`);
    }
    return parts.join(' | ');
  }
  if (httpStatus != null) {
    return `Meta Graph API request failed (HTTP ${httpStatus}).`;
  }
  return ax.message;
}

/** Structured detail for API responses when Graph returns an error body. */
export function metaGraphApiErrorDetail(err: unknown): {
  message: string;
  meta_http_status?: number;
  fbtrace_id?: string;
} {
  const message = metaGraphApiErrorMessage(err);
  if (!isAxiosError(err) || err.response == null) {
    return { message };
  }
  const meta = (err.response.data as MetaGraphErrorBody | undefined)?.error;
  const detail: {
    message: string;
    meta_http_status?: number;
    fbtrace_id?: string;
  } = { message };
  if (err.response.status != null) {
    detail.meta_http_status = err.response.status;
  }
  if (meta?.fbtrace_id) {
    detail.fbtrace_id = meta.fbtrace_id;
  }
  return detail;
}

export function isRetryableHttpError(
  err: unknown,
  retryableErrorList: readonly string[],
): boolean {
  const msg = httpErrorMessage(err).toLowerCase();
  return retryableErrorList.some((snippet) =>
    msg.includes(snippet.toLowerCase()),
  );
}
