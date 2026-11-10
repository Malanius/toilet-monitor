import { Logger } from '@aws-lambda-powertools/logger';
import middy from '@middy/core';

import { logErrors } from './log-errors';
import { expect, mock, test } from 'bun:test';

test('failed invocations are logged as errors and still fail', async () => {
  const logger = new Logger();
  const error = mock(() => undefined);
  logger.error = error as unknown as Logger['error'];
  const failure = new Error('boom');

  const handler = middy(async () => {
    throw failure;
  }).use(logErrors(logger));

  expect(handler({}, {} as never)).rejects.toBe(failure);
  await Bun.sleep(0);
  expect(error).toHaveBeenCalledWith('Invocation failed', failure);
});
