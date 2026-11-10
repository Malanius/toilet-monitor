import type { Logger } from '@aws-lambda-powertools/logger';
import type { MiddlewareObj } from '@middy/core';

/**
 * Logs failed invocations as structured errors, with the keys appended during the invocation.
 * Register it after `injectLambdaContext`, so it runs before the logger state is cleared.
 */
export const logErrors = (logger: Logger): MiddlewareObj => ({
  onError: async ({ error }) => {
    logger.error('Invocation failed', error as Error);
  },
});
