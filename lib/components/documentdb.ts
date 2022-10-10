import * as cdk from "@aws-cdk/core";
import { ClusterParameterGroup, DatabaseCluster, DatabaseSecret } from "@aws-cdk/aws-docdb";
import { InstanceType, IVpc, SecurityGroup, SubnetType, Vpc } from "@aws-cdk/aws-ec2";
import { BaseConstructProps } from "../utils";
import { RemovalPolicy, SecretValue } from "@aws-cdk/core";

interface ConstructProps extends BaseConstructProps {
  vpc: IVpc;
  tlsEnable: boolean;
  instanceType: InstanceType;
  useSecret?: boolean;
  credentials: {
    username: string;
    password?: string;
  };
  nodes?: number;
}

export class DocumentDbCluster extends cdk.Construct {
  public readonly cluster: DatabaseCluster;
  public readonly tlsEnable: boolean;
  public readonly securityGroup: SecurityGroup;
  public readonly secret?: DatabaseSecret;
  public readonly credentials: { username: string; password: string };

  constructor(scope: cdk.Construct, id: string, props: ConstructProps) {
    super(scope, id);

    this.securityGroup = new SecurityGroup(this, "SecurityGroup", { vpc: props.vpc });

    this.credentials = {
      ...props.credentials,
      password: props.credentials.password || "docdb_password",
    };

    const parameterGroup = new ClusterParameterGroup(this, "ParameterGroup", {
      family: "docdb4.0",
      parameters: {
        tls: props.tlsEnable ? "enabled" : "disabled",
      },
    });

    this.cluster = new DatabaseCluster(this, "DocumentDatabaseCluster", {
      masterUser: {
        username: this.credentials.username,
        password: props.useSecret ? undefined : SecretValue.unsafePlainText(this.credentials.password),
      },
      vpc: props.vpc,
      instanceType: props.instanceType,
      securityGroup: this.securityGroup,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
      storageEncrypted: true,
      parameterGroup,
      instances: props.nodes || 2,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    if (props.useSecret) {
      this.secret = new DatabaseSecret(this, "DatabaseSecret", {
        username: props.credentials.username,
      });
      this.secret.attach(this.cluster);
    }
  }
}
