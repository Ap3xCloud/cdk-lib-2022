import * as cdk from "@aws-cdk/core";
import { Vpc, FlowLog, SubnetType, FlowLogDestination, FlowLogTrafficType, NetworkAcl, AclCidr, AclTraffic, Action, TrafficDirection, Instance, CfnInstance, NatProvider } from "@aws-cdk/aws-ec2";
import { BaseConstructProps } from "../utils";
import { Bucket } from "@aws-cdk/aws-s3";

interface ConstructProps extends BaseConstructProps {
  logBucket?: Bucket;
  natProvider?: NatProvider;
}

export class ManagedVpcNetwork extends cdk.Construct {
  public readonly vpc: Vpc;
  public readonly flowLog?: FlowLog;

  constructor(scope: cdk.Construct, id: string, props: ConstructProps) {
    super(scope, id);

    this.vpc = new Vpc(this, "Vpc", {
      maxAzs: 3,
      natGatewayProvider: props.natProvider || NatProvider.gateway(),
      natGateways: 3,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Public",
          subnetType: SubnetType.PUBLIC,
        },
        {
          cidrMask: 23,
          name: "Private",
          subnetType: SubnetType.PRIVATE_WITH_NAT,
        },
        {
          cidrMask: 23,
          name: "Isolated",
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });
    this.vpc.publicSubnets.forEach((subnet) => {
      const instance_ = subnet.node.tryFindChild("NatInstance") as Instance | undefined;
      if (instance_) {
        instance_.node.tryRemoveChild("InstanceProfile");
        const cfnInstance_ = instance_.node.tryFindChild("Resource") as CfnInstance | undefined;
        if (cfnInstance_) {
          cfnInstance_.addPropertyOverride("IamInstanceProfile", props.instanceProfile.name);
          cfnInstance_.addDeletionOverride("DependsOn");
        }
      }
    });
    const instanceRole = this.vpc.node.tryFindChild("NatRole");
    if (instanceRole) {
      this.vpc.node.tryRemoveChild("NatRole");
    }

    // this.vpcFlowLog = this.vpc.addFlowLog("VpcFlowLogToCloudWatch", {
    //   destination: FlowLogDestination.toCloudWatchLogs(undefined, props.teamrole),
    //   trafficType: FlowLogTrafficType.ALL,
    // });

    const networkAcl = new NetworkAcl(this, "NetworkAcl", {
      vpc: this.vpc,
      subnetSelection: { subnets: [...this.vpc.publicSubnets, ...this.vpc.privateSubnets, ...this.vpc.isolatedSubnets] },
    });
    // Ingress
    networkAcl.addEntry("ingress-ssh", {
      direction: TrafficDirection.INGRESS,
      cidr: AclCidr.anyIpv4(),
      ruleNumber: 100,
      traffic: AclTraffic.tcpPort(22),
      ruleAction: Action.ALLOW,
    });
    networkAcl.addEntry("ingress-http", {
      direction: TrafficDirection.INGRESS,
      cidr: AclCidr.anyIpv4(),
      ruleNumber: 110,
      traffic: AclTraffic.tcpPort(80),
      ruleAction: Action.ALLOW,
    });
    networkAcl.addEntry("ingress-https", {
      direction: TrafficDirection.INGRESS,
      cidr: AclCidr.anyIpv4(),
      ruleNumber: 120,
      traffic: AclTraffic.tcpPort(443),
      ruleAction: Action.ALLOW,
    });
    networkAcl.addEntry("ingress-ephemeral-port", {
      direction: TrafficDirection.INGRESS,
      cidr: AclCidr.anyIpv4(),
      ruleNumber: 130,
      traffic: AclTraffic.tcpPortRange(1024, 65535),
      ruleAction: Action.ALLOW,
    });
    networkAcl.addEntry("ingress-local", {
      direction: TrafficDirection.INGRESS,
      cidr: AclCidr.ipv4(this.vpc.vpcCidrBlock),
      ruleNumber: 200,
      traffic: AclTraffic.allTraffic(),
      ruleAction: Action.ALLOW,
    });
    // Egress
    networkAcl.addEntry("egress-http", {
      direction: TrafficDirection.EGRESS,
      cidr: AclCidr.anyIpv4(),
      ruleNumber: 100,
      traffic: AclTraffic.tcpPort(80),
      ruleAction: Action.ALLOW,
    });
    networkAcl.addEntry("egress-https", {
      direction: TrafficDirection.EGRESS,
      cidr: AclCidr.anyIpv4(),
      ruleNumber: 110,
      traffic: AclTraffic.tcpPort(443),
      ruleAction: Action.ALLOW,
    });
    networkAcl.addEntry("egress-ephemeral-port", {
      direction: TrafficDirection.EGRESS,
      cidr: AclCidr.anyIpv4(),
      ruleNumber: 120,
      traffic: AclTraffic.tcpPortRange(1024, 65535),
      ruleAction: Action.ALLOW,
    });
    networkAcl.addEntry("egress-local", {
      direction: TrafficDirection.EGRESS,
      cidr: AclCidr.ipv4(this.vpc.vpcCidrBlock),
      ruleNumber: 200,
      traffic: AclTraffic.allTraffic(),
      ruleAction: Action.ALLOW,
    });

    if (props.logBucket) {
      this.flowLog = this.vpc.addFlowLog("flow-log", {
        destination: FlowLogDestination.toS3(props.logBucket, "vpc-flow-log"),
      });
    }
  }
}
