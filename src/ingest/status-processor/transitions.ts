import { type Connectivity, StatusEventType, type ToiletStatus } from '@/contracts/events';
import { ItemType, type StateItem, toiletPk } from '@/contracts/status-item';

/** Door open means free: the doors are left open when nobody's inside. */
export const statusFromDoor = (door: 'open' | 'closed'): ToiletStatus => (door === 'open' ? 'vacant' : 'occupied');

export interface Observation {
  toiletId: string;
  status: ToiletStatus;
  connectivity: Connectivity;
  /** ISO timestamp. */
  observedAt: string;
}

/**
 * Plans the STATE writes an observation causes, in order. Each write becomes
 * exactly one event, so a write is planned only for a real change:
 * - first observation of a toilet: one status change from `unknown`
 * - back from offline: a connectivity change first, then a status change if the status differs too
 * - same status as stored, or older than the stored state: nothing
 */
export const planStateWrites = (current: StateItem | undefined, observation: Observation): StateItem[] => {
  const { toiletId, observedAt } = observation;

  if (!current) {
    return [
      {
        pk: toiletPk(toiletId),
        sk: ItemType.State,
        toiletId,
        status: observation.status,
        connectivity: observation.connectivity,
        changedAt: observedAt,
        changeType: StatusEventType.StatusChanged,
        previousStatus: 'unknown',
        previousConnectivity: 'unknown',
        previousChangedAt: '',
        revision: 1,
      },
    ];
  }

  // Out of order or duplicate delivery, the stored state is already newer
  if (observedAt <= current.changedAt) {
    return [];
  }

  const writes: StateItem[] = [];
  let previous = current;
  const next = (changes: Pick<StateItem, 'status' | 'connectivity' | 'changeType'>): StateItem => {
    const item: StateItem = {
      ...previous,
      ...changes,
      changedAt: observedAt,
      previousStatus: previous.status,
      previousConnectivity: previous.connectivity,
      previousChangedAt: previous.changedAt,
      revision: previous.revision + 1,
    };
    writes.push(item);
    previous = item;
    return item;
  };

  if (observation.connectivity !== previous.connectivity) {
    next({
      status: previous.status,
      connectivity: observation.connectivity,
      changeType: observation.connectivity === 'offline' ? StatusEventType.WentOffline : StatusEventType.CameOnline,
    });
  }

  if (observation.status !== previous.status) {
    next({
      status: observation.status,
      connectivity: previous.connectivity,
      changeType: StatusEventType.StatusChanged,
    });
  }

  return writes;
};
