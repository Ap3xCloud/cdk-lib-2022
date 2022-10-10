import * as cdk from "@aws-cdk/core";
import { Peer, Port, SecurityGroup } from "@aws-cdk/aws-ec2";
import { ManagedVpcNetwork } from "./managed-vpc-network";

export interface ISecurityGroups {
  applicationLoadBalancer: SecurityGroup;
  rds: {
    mysql: SecurityGroup;
    postgresql: SecurityGroup;
  };
  elastiCache: {
    redis: SecurityGroup;
    memacahed: SecurityGroup;
  };
  efs: SecurityGroup;
  ecsEc2Cluster: SecurityGroup;
  ec2Instance: SecurityGroup;
  bastionHost: SecurityGroup;
  documentDb: SecurityGroup;
}

interface ConstructProps {
  vpcNetwork: ManagedVpcNetwork;
}

export class SecurityGroups extends cdk.Construct {
  public securityGroups: ISecurityGroups;

  constructor(scope: cdk.Construct, id: string, props: ConstructProps) {
    super(scope, id);

    this.securityGroups = {
      applicationLoadBalancer: new SecurityGroup(this, "ApplicationLoadBalancerSecurityGroup", { vpc: props.vpcNetwork.vpc }),
      rds: {
        mysql: new SecurityGroup(this, "RdsMysqlSecurityGroup", { vpc: props.vpcNetwork.vpc }),
        postgresql: new SecurityGroup(this, "RdsPostgresqlSecurityGroup", { vpc: props.vpcNetwork.vpc }),
      },
      elastiCache: {
        redis: new SecurityGroup(this, "ElasticacheRedisSecurityGroup", { vpc: props.vpcNetwork.vpc }),
        memacahed: new SecurityGroup(this, "ElasticacheMemacahedSecurityGroup", { vpc: props.vpcNetwork.vpc }),
      },
      efs: new SecurityGroup(this, "EfsSecurityGroup", { vpc: props.vpcNetwork.vpc }),
      ecsEc2Cluster: new SecurityGroup(this, "EcsEc2ClusterSecurityGroup", { vpc: props.vpcNetwork.vpc }),
      ec2Instance: new SecurityGroup(this, "Ec2InstanceSecurityGroup", { vpc: props.vpcNetwork.vpc }),
      bastionHost: new SecurityGroup(this, "BastionHostSecurityGroup", { vpc: props.vpcNetwork.vpc }),
      documentDb: new SecurityGroup(this, "DocumentDbSecurityGroup", { vpc: props.vpcNetwork.vpc }),
    };

    // EFS
    this.securityGroups.efs.addIngressRule(this.securityGroups.bastionHost, Port.tcp(2049));
    this.securityGroups.efs.addIngressRule(this.securityGroups.ecsEc2Cluster, Port.tcp(2049));
    this.securityGroups.efs.addIngressRule(this.securityGroups.ec2Instance, Port.tcp(2049));

    // Postgres
    this.securityGroups.rds.postgresql.addIngressRule(this.securityGroups.bastionHost, Port.tcp(5432));
    this.securityGroups.rds.postgresql.addIngressRule(this.securityGroups.ecsEc2Cluster, Port.tcp(5432));
    this.securityGroups.rds.postgresql.addIngressRule(this.securityGroups.ec2Instance, Port.tcp(5432));
    //MySQL
    this.securityGroups.rds.mysql.addIngressRule(this.securityGroups.bastionHost, Port.tcp(3306));
    this.securityGroups.rds.mysql.addIngressRule(this.securityGroups.ecsEc2Cluster, Port.tcp(3306));
    this.securityGroups.rds.mysql.addIngressRule(this.securityGroups.ec2Instance, Port.tcp(3306));

    //Redis
    this.securityGroups.elastiCache.redis.addIngressRule(this.securityGroups.bastionHost, Port.tcp(6379));
    this.securityGroups.elastiCache.redis.addIngressRule(this.securityGroups.ecsEc2Cluster, Port.tcp(6379));
    this.securityGroups.elastiCache.redis.addIngressRule(this.securityGroups.ec2Instance, Port.tcp(6379));
    //Memcached
    this.securityGroups.elastiCache.memacahed.addIngressRule(this.securityGroups.bastionHost, Port.tcp(11211));
    this.securityGroups.elastiCache.memacahed.addIngressRule(this.securityGroups.ecsEc2Cluster, Port.tcp(11211));
    this.securityGroups.elastiCache.memacahed.addIngressRule(this.securityGroups.ec2Instance, Port.tcp(11211));

    //DocumentDB - MongoDB
    this.securityGroups.documentDb.addIngressRule(this.securityGroups.bastionHost, Port.tcp(27017));
    this.securityGroups.documentDb.addIngressRule(this.securityGroups.ecsEc2Cluster, Port.tcp(27017));
    this.securityGroups.documentDb.addIngressRule(this.securityGroups.ec2Instance, Port.tcp(27017));

    this.securityGroups.bastionHost.addIngressRule(Peer.anyIpv4(), Port.tcp(22));

    this.securityGroups.ecsEc2Cluster.addIngressRule(this.securityGroups.applicationLoadBalancer, Port.tcpRange(32768, 65535));

    this.securityGroups.ec2Instance.addIngressRule(this.securityGroups.applicationLoadBalancer, Port.tcp(80));

    this.securityGroups.applicationLoadBalancer.addIngressRule(Peer.anyIpv4(), Port.tcp(80));
  }
}
