import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { type DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { type DeviceItem, ItemType, type StateItem, toiletPk } from '@/contracts/status-item';

/** Where the status items live. */
export interface StatusTable {
  db: DynamoDBDocumentClient;
  tableName: string;
}

export class StaleRevisionError extends Error {}

const getItem = async <T>(table: StatusTable, toiletId: string, sk: string): Promise<T | undefined> => {
  const { Item } = await table.db.send(
    new GetCommand({ TableName: table.tableName, Key: { pk: toiletPk(toiletId), sk }, ConsistentRead: true })
  );
  return Item as T | undefined;
};

export const getState = (table: StatusTable, toiletId: string) => getItem<StateItem>(table, toiletId, ItemType.State);

export const getDevice = (table: StatusTable, toiletId: string) =>
  getItem<DeviceItem>(table, toiletId, ItemType.Device);

/**
 * Writes the STATE item if nobody else wrote it since revision `item.revision - 1`.
 * @throws StaleRevisionError when a concurrent write won
 */
export const putState = async (table: StatusTable, item: StateItem): Promise<void> => {
  try {
    await table.db.send(
      new PutCommand({
        TableName: table.tableName,
        Item: item,
        ConditionExpression:
          item.revision === 1 ? 'attribute_not_exists(pk)' : 'attribute_exists(pk) AND revision = :expected',
        ExpressionAttributeValues: item.revision === 1 ? undefined : { ':expected': item.revision - 1 },
      })
    );
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      throw new StaleRevisionError(`STATE of '${item.toiletId}' changed concurrently`);
    }
    throw error;
  }
};

/**
 * Records that the device was seen, unless a newer message was already recorded. The same message again
 * counts as fresh, so a retried invocation finishes what the failed one started.
 * @returns false when the stored telemetry is newer
 */
export const touchDevice = async (
  table: StatusTable,
  device: Omit<DeviceItem, 'pk' | 'sk' | 'batteryMeasuredAt'>
): Promise<boolean> => {
  const { toiletId, lastSeenAt, lastWakeReason, batteryMv } = device;
  try {
    await table.db.send(
      new UpdateCommand({
        TableName: table.tableName,
        Key: { pk: toiletPk(toiletId), sk: ItemType.Device },
        UpdateExpression: [
          'SET toiletId = :toiletId, lastSeenAt = :lastSeenAt, lastWakeReason = :lastWakeReason',
          // Battery is kept from older messages when this one has none, with the time it was measured
          batteryMv === undefined ? '' : ', batteryMv = :batteryMv, batteryMeasuredAt = :lastSeenAt',
        ].join(''),
        ConditionExpression: 'attribute_not_exists(lastSeenAt) OR lastSeenAt <= :lastSeenAt',
        ExpressionAttributeValues: {
          ':toiletId': toiletId,
          ':lastSeenAt': lastSeenAt,
          ':lastWakeReason': lastWakeReason,
          ':batteryMv': batteryMv,
        },
      })
    );
    return true;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      return false;
    }
    throw error;
  }
};
