import * as cdk from "@aws-cdk/core";
import { RemovalPolicy } from "@aws-cdk/core";
import { InstanceType, InstanceClass, InstanceSize, SubnetType, SecurityGroup, Vpc, IVpc } from "@aws-cdk/aws-ec2";
import { AuroraMysqlEngineVersion, Credentials, DatabaseCluster, DatabaseClusterEngine, DatabaseSecret, IClusterEngine, IInstanceEngine } from "@aws-cdk/aws-rds";
import { BaseConstructProps } from "../utils";

interface ConstructProps extends BaseConstructProps {
  vpc: IVpc;
  engine?: IClusterEngine;
  instanceType?: InstanceType;
  credentials: { username: string; defaultDatabaseName: string };
  instances?: number;
}

export class RdsAuroraDatabase extends cdk.Construct {
  public readonly cluster: DatabaseCluster;
  public readonly secret: DatabaseSecret;
  public readonly securityGroup: SecurityGroup;

  constructor(scope: cdk.Construct, id: string, props: ConstructProps) {
    super(scope, id);

    this.securityGroup = new SecurityGroup(this, "DatabaseSecurityGroup", { vpc: props.vpc });

    this.secret = new DatabaseSecret(this, "DatabaseSecret", {
      username: props.credentials.username,
    });

    this.cluster = new DatabaseCluster(this, "AuroraCluster", {
      engine: props.engine || DatabaseClusterEngine.auroraMysql({ version: AuroraMysqlEngineVersion.VER_2_10_2 }),
      credentials: Credentials.fromSecret(this.secret),
      defaultDatabaseName: props.credentials.defaultDatabaseName,
      instanceProps: {
        instanceType: props.instanceType || InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
        vpc: props.vpc,
        vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
        securityGroups: [this.securityGroup],
        publiclyAccessible: false,
      },
      instances: props.instances || 2,
      removalPolicy: RemovalPolicy.DESTROY,
      storageEncrypted: true,
    });
  }
}
