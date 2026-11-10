import { atExpression, decideOnTimeout, livenessScheduleName, offlineAt } from './liveness';
import { describe, expect, test } from 'bun:test';

const HOUR = 60 * 60;

describe('liveness', () => {
  test('schedule name and expression', () => {
    expect(livenessScheduleName('ground-floor')).toBe('offline-ground-floor');
    expect(atExpression(new Date('2026-11-10T20:25:15.246Z'))).toBe('at(2026-11-10T20:25:15)');
  });

  test('deadline is the last report plus the offline delay', () => {
    expect(offlineAt('2026-11-10T08:00:00.000Z', 13 * HOUR)).toEqual(new Date('2026-11-10T21:00:00.000Z'));
  });

  test('timer at or past the deadline marks the toilet offline as of the deadline', () => {
    expect(decideOnTimeout('2026-11-10T08:00:00.000Z', 13 * HOUR, new Date('2026-11-10T21:00:30.000Z'))).toEqual({
      action: 'markOffline',
      offlineAt: new Date('2026-11-10T21:00:00.000Z'),
    });
  });

  test('timer before the deadline of the last report re-arms for that deadline', () => {
    expect(decideOnTimeout('2026-11-10T10:00:00.000Z', 13 * HOUR, new Date('2026-11-10T21:00:30.000Z'))).toEqual({
      action: 'rearm',
      at: new Date('2026-11-10T23:00:00.000Z'),
    });
  });
});
