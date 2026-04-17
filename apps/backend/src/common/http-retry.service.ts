import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { httpErrorMessage, isRetryableHttpError } from './http-error.util';
import { PUSHSALE_REQUEST_INTERVAL_MS } from './pushsale-request-interval';

export type PostJsonWithRetryOptions = {
  /** Delay before repeating the same request after a retryable failure. */
  retryWaitMs?: number;
};

export type PostJsonWithRetryResult<T> = {
  response: AxiosResponse<T>;
  /** Time from request start until HTTP response completed successfully. */
  durationMs: number;
  /** Timestamp (ms) when the successful attempt started; useful for rate-limit pacing. */
  requestStartedAt: number;
};

/**
 * Shared outbound HTTP helper: POST JSON with substring-based retry on transport / rate-limit style errors.
 * Inject into feature services or extend with domain-specific wrappers as needed.
 */
@Injectable()
export class HttpRetryService {
  private readonly logger = new Logger(HttpRetryService.name);

  constructor(private readonly httpService: HttpService) {}

  async postJsonWithRetry<ResponseBody>(
    apiUrl: string,
    params: Record<string, unknown>,
    retryableErrorList: readonly string[],
    options?: PostJsonWithRetryOptions,
  ): Promise<PostJsonWithRetryResult<ResponseBody>> {
    const retryWaitMs = options?.retryWaitMs ?? PUSHSALE_REQUEST_INTERVAL_MS;

    for (;;) {
      const requestStartedAt = Date.now();
      try {
        const response = await firstValueFrom(
          this.httpService.post<ResponseBody>(apiUrl, params),
        );
        const durationMs = Date.now() - requestStartedAt;
        return { response, durationMs, requestStartedAt };
      } catch (err) {
        if (!isRetryableHttpError(err, retryableErrorList)) {
          throw err;
        }
        this.logger.warn(
          `POST ${apiUrl} retryable error: ${httpErrorMessage(err)}. Waiting ${retryWaitMs}ms before retry.`,
        );
        await this.delay(retryWaitMs);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    if (ms <= 0) {
      return Promise.resolve();
    }
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
