import { RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, StreamViewType, TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

import { type AppInfo, isProd } from '@/common/app-info';

export interface StatusTableProps extends AppInfo {}

/** Current state and device telemetry per toilet, with a stream feeding the status events. */
export class StatusTable extends Construct {
  readonly table: TableV2;

  constructor(scope: Construct, id: string, props: StatusTableProps) {
    super(scope, id);

    const prod = isProd(props);

    this.table = new TableV2(this, 'Table', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      // The pipe builds events from the new image only, see StateItem
      dynamoStream: StreamViewType.NEW_IMAGE,
      deletionProtection: prod,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: prod },
      removalPolicy: prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
  }
}
