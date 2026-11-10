import { ConditionalCheckFailedException, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { type DeviceItem, ItemType, type StateItem, toiletPk } from '@/contracts/status-item';

export class StaleRevisionError extends Error {}

export class StatusRepository {
  private readonly db: DynamoDBDocumentClient;

  constructor(
    client: DynamoDBClient,
    private readonly tableName: string
  ) {
    this.db = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
  }

  async getState(toiletId: string): Promise<StateItem | undefined> {
    const { Item } = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: toiletPk(toiletId), sk: ItemType.State },
        ConsistentRead: true,
      })
    );
    return Item as StateItem | undefined;
  }

  /**
   * Writes the STATE item if nobody else wrote it since revision `item.revision - 1`.
   * @throws StaleRevisionError when a concurrent write won
   */
  async putState(item: StateItem): Promise<void> {
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.tableName,
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
  }

  /**
   * Records that the device was seen, unless a newer message was already recorded.
   * @returns false when the stored telemetry is newer
   */
  async touchDevice(device: Omit<DeviceItem, 'pk' | 'sk' | 'batteryMeasuredAt'>): Promise<boolean> {
    const { toiletId, lastSeenAt, lastWakeReason, batteryMv } = device;
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { pk: toiletPk(toiletId), sk: ItemType.Device },
          UpdateExpression: [
            'SET toiletId = :toiletId, lastSeenAt = :lastSeenAt, lastWakeReason = :lastWakeReason',
            // Battery is kept from older messages when this one has none, with the time it was measured
            batteryMv === undefined ? '' : ', batteryMv = :batteryMv, batteryMeasuredAt = :lastSeenAt',
          ].join(''),
          ConditionExpression: 'attribute_not_exists(lastSeenAt) OR lastSeenAt < :lastSeenAt',
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
  }
}
