import { StatusEventType } from '@/contracts/events';
import type { StateItem } from '@/contracts/status-item';

import { type Observation, planStateWrites, statusFromDoor } from './transitions';
import { describe, expect, test } from 'bun:test';

const T0 = '2026-11-10T10:00:00.000Z';
const T1 = '2026-11-10T10:05:00.000Z';

const stored = (overrides: Partial<StateItem> = {}): StateItem => ({
  pk: 'TOILET#t1',
  sk: 'STATE',
  toiletId: 't1',
  status: 'occupied',
  connectivity: 'online',
  changedAt: T0,
  changeType: StatusEventType.StatusChanged,
  previousStatus: 'vacant',
  previousConnectivity: 'online',
  previousChangedAt: '2026-11-10T09:00:00.000Z',
  revision: 7,
  ...overrides,
});

const observe = (overrides: Partial<Observation> = {}): Observation => ({
  toiletId: 't1',
  status: 'vacant',
  connectivity: 'online',
  observedAt: T1,
  ...overrides,
});

describe('statusFromDoor', () => {
  test('open door means vacant, closed means occupied', () => {
    expect(statusFromDoor('open')).toBe('vacant');
    expect(statusFromDoor('closed')).toBe('occupied');
  });
});

describe('planStateWrites', () => {
  test('first observation is a status change from unknown', () => {
    expect(planStateWrites(undefined, observe())).toEqual([
      {
        pk: 'TOILET#t1',
        sk: 'STATE',
        toiletId: 't1',
        status: 'vacant',
        connectivity: 'online',
        changedAt: T1,
        changeType: StatusEventType.StatusChanged,
        previousStatus: 'unknown',
        previousConnectivity: 'unknown',
        previousChangedAt: '',
        revision: 1,
      },
    ]);
  });

  test('status change carries the previous state', () => {
    const [write, ...rest] = planStateWrites(stored(), observe());

    expect(rest).toEqual([]);
    expect(write).toMatchObject({
      status: 'vacant',
      connectivity: 'online',
      changedAt: T1,
      changeType: StatusEventType.StatusChanged,
      previousStatus: 'occupied',
      previousConnectivity: 'online',
      previousChangedAt: T0,
      revision: 8,
    });
  });

  test('same status is not a change', () => {
    expect(planStateWrites(stored(), observe({ status: 'occupied' }))).toEqual([]);
  });

  test('observations not newer than the stored state are ignored', () => {
    expect(planStateWrites(stored(), observe({ observedAt: T0 }))).toEqual([]);
    expect(planStateWrites(stored(), observe({ observedAt: '2026-11-10T09:59:59.999Z' }))).toEqual([]);
  });

  test('back from offline with the same status only comes online', () => {
    const writes = planStateWrites(stored({ connectivity: 'offline' }), observe({ status: 'occupied' }));

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      status: 'occupied',
      connectivity: 'online',
      changeType: StatusEventType.CameOnline,
      previousConnectivity: 'offline',
      revision: 8,
    });
  });

  test('back from offline with a different status comes online first, then changes status', () => {
    const [online, status] = planStateWrites(stored({ connectivity: 'offline' }), observe());

    expect(online).toMatchObject({
      status: 'occupied',
      connectivity: 'online',
      changeType: StatusEventType.CameOnline,
      previousStatus: 'occupied',
      previousConnectivity: 'offline',
      previousChangedAt: T0,
      revision: 8,
    });
    expect(status).toMatchObject({
      status: 'vacant',
      connectivity: 'online',
      changeType: StatusEventType.StatusChanged,
      previousStatus: 'occupied',
      previousConnectivity: 'online',
      previousChangedAt: T1,
      revision: 9,
    });
  });

  test('going offline keeps the last known status', () => {
    const writes = planStateWrites(stored(), observe({ status: 'occupied', connectivity: 'offline' }));

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      status: 'occupied',
      connectivity: 'offline',
      changeType: StatusEventType.WentOffline,
    });
  });
});
