import * as cdk from "@aws-cdk/core";
import { BaseConstructProps } from "../utils";
import { InstanceClass, InstanceSize, InstanceType, IVpc, SecurityGroup, SubnetType, Vpc } from "@aws-cdk/aws-ec2";
import { Credentials, DatabaseInstance, DatabaseInstanceEngine, DatabaseInstanceReadReplica, DatabaseSecret, IInstanceEngine, MysqlEngineVersion } from "@aws-cdk/aws-rds";
import { CfnOutput, RemovalPolicy, SecretValue } from "@aws-cdk/core";
import _ from "lodash";

interface ConstructProps extends BaseConstructProps {
  vpc: IVpc;
  engine?: IInstanceEngine;
  instanceType?: InstanceType;
  useSecret?: boolean;
  credentials: { username: string; defaultDatabaseName: string; password?: string };
  replica?: number;
}

export class RdsDatabase extends cdk.Construct {
  public readonly instance: DatabaseInstance;
  public readonly replicas: DatabaseInstanceReadReplica[];
  public readonly secret: DatabaseSecret;
  public readonly securityGroup: SecurityGroup;
  public readonly credentials: { username: string; defaultDatabaseName: string; password: string };
  public readonly useSecret: boolean;

  constructor(scope: cdk.Construct, id: string, props: ConstructProps) {
    super(scope, id);

    this.useSecret = !!props.useSecret;

    this.securityGroup = new SecurityGroup(this, "DatabaseSecurityGroup", { vpc: props.vpc });

    if (props.useSecret) {
      this.secret = new DatabaseSecret(this, "DatabaseSecret", {
        username: props.credentials.username,
      });
    }

    this.credentials = {
      ...props.credentials,
      password: props.credentials.password || "rdsdb_password",
    };

    this.instance = new DatabaseInstance(this, "DatabaseInstance", {
      engine: props.engine || DatabaseInstanceEngine.mysql({ version: MysqlEngineVersion.VER_8_0_28 }),
      instanceType: props.instanceType || InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),
      allocatedStorage: 200,
      credentials: this.secret ? Credentials.fromSecret(this.secret) : Credentials.fromPassword(this.credentials.username, SecretValue.unsafePlainText(this.credentials.password)),
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
      securityGroups: [this.securityGroup],
      removalPolicy: RemovalPolicy.DESTROY,
      deletionProtection: false,
      multiAz: true,
      //   enablePerformanceInsights:true,
      databaseName: props.credentials.defaultDatabaseName,
      monitoringRole: props.teamrole,
    });

    new CfnOutput(this, "RDSDatabaseEndpoint", {
      value: this.instance.dbInstanceEndpointAddress,
    });

    if (props.replica) {
      this.replicas = [];
      _.range(0, props.replica).forEach((i) => {
        this.replicas.push(
          new DatabaseInstanceReadReplica(this, `ReadReplica${i + 1}`, {
            sourceDatabaseInstance: this.instance,
            instanceType: props.instanceType || InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),
            vpc: props.vpc,
            vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
            securityGroups: [this.securityGroup],
            removalPolicy: RemovalPolicy.DESTROY,
            deletionProtection: false,
            multiAz: true,
          }),
        );
      });
    }
  }
}
