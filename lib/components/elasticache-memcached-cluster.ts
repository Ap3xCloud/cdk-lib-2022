import * as cdk from "@aws-cdk/core";
import { CfnCacheCluster, CfnSubnetGroup } from "@aws-cdk/aws-elasticache";
import { BaseConstructProps } from "../utils";
import { IEndpoint } from "../utils/index";
import { IVpc, SecurityGroup, Vpc } from "@aws-cdk/aws-ec2";

interface ConstructProps extends BaseConstructProps {
  vpc: IVpc;
  nodeType?: string;
  numCacheNodes?: number;
  azMode?: "single-az" | "cross-az";
}

export class ElasticacheMemcachedCluster extends cdk.Construct {
  public readonly cluster: CfnCacheCluster;
  public readonly endpoint: IEndpoint;
  public readonly securityGroup: SecurityGroup;

  constructor(scope: cdk.Construct, id: string, props: ConstructProps) {
    super(scope, id);

    this.securityGroup = new SecurityGroup(this, "SecurityGroup", { vpc: props.vpc });

    const subnetGroup = new CfnSubnetGroup(this, "SubnetGroup", {
      description: "ElasticacheMemcachedSubnetGroup",
      subnetIds: props.vpc.isolatedSubnets.map((subnet) => subnet.subnetId),
    });

    // M5 node types: cache.m5.large, cache.m5.xlarge, cache.m5.2xlarge, cache.m5.4xlarge, cache.m5.12xlarge, cache.m5.24xlarge
    // M4 node types: cache.m4.large, cache.m4.xlarge, cache.m4.2xlarge, cache.m4.4xlarge, cache.m4.10xlarge
    // T3 node types: cache.t3.micro, cache.t3.small, cache.t3.medium
    // T2 node types: cache.t2.micro, cache.t2.small, cache.t2.medium
    // T1 node types: cache.t1.micro
    // M1 node types: cache.m1.small, cache.m1.medium, cache.m1.large, cache.m1.xlarge
    // M3 node types: cache.m3.medium, cache.m3.large, cache.m3.xlarge, cache.m3.2xlarge
    // C1 node types: cache.c1.xlarge
    // R5 node types: cache.r5.large, cache.r5.xlarge, cache.r5.2xlarge, cache.r5.4xlarge, cache.r5.12xlarge, cache.r5.24xlarge
    // R4 node types: cache.r4.large, cache.r4.xlarge, cache.r4.2xlarge, cache.r4.4xlarge, cache.r4.8xlarge, cache.r4.16xlarge
    // M2 node types: cache.m2.xlarge, cache.m2.2xlarge, cache.m2.4xlarge
    // R3 node types: cache.r3.large, cache.r3.xlarge, cache.r3.2xlarge, cache.r3.4xlarge, cache.r3.8xlarge

    this.cluster = new CfnCacheCluster(this, "Cluster", {
      cacheNodeType: props.nodeType || "cache.t2.micro",
      engine: "memcached",
      azMode: props.azMode || "cross-az",
      numCacheNodes: props.numCacheNodes || 3,
      cacheSubnetGroupName: subnetGroup.ref,
      vpcSecurityGroupIds: [this.securityGroup.securityGroupId],
    });
    this.cluster.addDependsOn(subnetGroup);

    this.endpoint = {
      hostname: this.cluster.attrConfigurationEndpointAddress,
      port: this.cluster.attrConfigurationEndpointPort,
    };
  }
}
