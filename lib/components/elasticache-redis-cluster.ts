import * as cdk from "@aws-cdk/core";
import { IVpc, SecurityGroup, Vpc } from "@aws-cdk/aws-ec2";
import { CfnReplicationGroup, CfnSubnetGroup } from "@aws-cdk/aws-elasticache";
import { BaseConstructProps, IEndpoint } from "../utils";

interface ConstructProps extends BaseConstructProps {
  vpc: IVpc;
  nodeType?: string;
  replicas?: number;
}

export class ElasticacheRedisCluster extends cdk.Construct {
  public readonly cluster: CfnReplicationGroup;
  public readonly endpoint: IEndpoint;
  public readonly securityGroup: SecurityGroup;

  constructor(scope: cdk.Construct, id: string, props: ConstructProps) {
    super(scope, id);

    this.securityGroup = new SecurityGroup(this, "SecurityGroup", { vpc: props.vpc });

    const subnetGroup = new CfnSubnetGroup(this, "SubnetGroup", {
      description: "ElasticacheRedisSubnetGroup",
      subnetIds: props.vpc.isolatedSubnets.map((subnet) => subnet.subnetId),
    });

    /*
     * numNodeGroups=1 & replicasPerNodeGroup=2 === 1 Primary Read-Write Node + 2 Read Replica => Total 3 nodes [Single Node Mode]
     * numNodeGroups=3 & replicasPerNodeGroup=2 === 3 Shards + 2 Read Replica per Shard => Total 9 nodes [Cluster Mode]
     */

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

    this.cluster = new CfnReplicationGroup(this, "Cluster", {
      replicationGroupDescription: "RedisCluster",
      cacheNodeType: props.nodeType || "cache.t2.micro",
      engine: "redis",
      numNodeGroups: 2,
      replicasPerNodeGroup: props.replicas || 1,
      securityGroupIds: [this.securityGroup.securityGroupId],
      cacheSubnetGroupName: subnetGroup.ref,
      automaticFailoverEnabled: true,
      multiAzEnabled: true,
      transitEncryptionEnabled: true,
      atRestEncryptionEnabled: true,
    });

    this.endpoint = {
      hostname: this.cluster.attrConfigurationEndPointAddress,
      port: this.cluster.attrConfigurationEndPointPort,
    };
  }
}
