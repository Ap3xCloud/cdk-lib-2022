import * as cdk from "@aws-cdk/core";
import { InstanceType, IVpc, SecurityGroup, UserData, Vpc } from "@aws-cdk/aws-ec2";
import { AsgCapacityProvider, Cluster, EcsOptimizedImage } from "@aws-cdk/aws-ecs";
import { AutoScalingGroup, CfnLaunchConfiguration, Monitoring } from "@aws-cdk/aws-autoscaling";
import { BaseConstructProps } from "../utils";
import { Fn } from "@aws-cdk/core";

interface ConstructProps extends BaseConstructProps {
  vpc: IVpc;
}

export class EcsFargateCluster extends cdk.Construct {
  public readonly cluster: Cluster;
  public readonly securityGroup: SecurityGroup;

  constructor(scope: cdk.Construct, id: string, props: ConstructProps) {
    super(scope, id);

    this.securityGroup = new SecurityGroup(this, "SecurityGroup", { vpc: props.vpc });

    this.cluster = new Cluster(this, "Cluster", {
      vpc: props.vpc,
      enableFargateCapacityProviders: true,
      containerInsights: true,
    });
  }
}
