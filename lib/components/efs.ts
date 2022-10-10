import * as cdk from "@aws-cdk/core";
import { IVpc, SecurityGroup, SubnetType, Vpc } from "@aws-cdk/aws-ec2";
import { AccessPoint, FileSystem, PerformanceMode, ThroughputMode } from "@aws-cdk/aws-efs";
import { CfnOutput } from "@aws-cdk/core";
import { BaseConstructProps } from "../utils";

interface ConstructProps extends BaseConstructProps {
  vpc: IVpc;
}

export class Efs extends cdk.Construct {
  public readonly fileSystem: FileSystem;
  public readonly accessPoint: AccessPoint;
  public readonly securityGroup: SecurityGroup;

  constructor(scope: cdk.Construct, id: string, props: ConstructProps) {
    super(scope, id);

    this.securityGroup = new SecurityGroup(this, "SecurityGroup", { vpc: props.vpc });

    this.fileSystem = new FileSystem(this, "FileSystem", {
      vpc: props.vpc,
      performanceMode: PerformanceMode.GENERAL_PURPOSE,
      securityGroup: this.securityGroup,
      throughputMode: ThroughputMode.BURSTING,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_ISOLATED,
      },
    });

    new CfnOutput(this, "FileSystemEndpoint", {
      value: `${this.fileSystem.fileSystemId}.efs.${cdk.Stack.of(this).region}.amazonaws.com`,
    });

    this.accessPoint = this.fileSystem.addAccessPoint("AccessPoint");

    // this.fileSystemEndpoint = `${this.fileSystem.fileSystemId}.efs.${cdk.Stack.of(this).region}.amazonaws.com`;
  }
}
