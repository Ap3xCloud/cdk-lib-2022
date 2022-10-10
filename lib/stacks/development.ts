import * as cdk from "@aws-cdk/core";
import { Stack, StackProps } from "@aws-cdk/core";
import { Role } from "@aws-cdk/aws-iam";
import { ManagedVpcNetwork } from "../components/managed-vpc-network";
import { BaseConstructProps } from "../utils";
import { BastionHost } from "../components/bastion-host";
import { RdsDatabase } from "../components/rds-database";
import { AuroraMysqlEngineVersion, DatabaseClusterEngine, DatabaseInstanceEngine, MysqlEngineVersion } from "@aws-cdk/aws-rds";
import { InstanceType, InstanceClass, InstanceSize, Port, NatProvider } from "@aws-cdk/aws-ec2";
import { ElasticacheRedisCluster } from "../components/elasticache-redis-cluster";
import { ElasticacheRedisReplicationGroup } from "../components/elasticache-redis-replication-group";
import { ElasticacheMemcachedCluster } from "../components/elasticache-memcached-cluster";
import { RdsAuroraDatabase } from "../components/rds-aurora-database";
import { DocumentDbCluster } from "../components/documentdb";
import { S3Buckets } from "../components/s3-buckets";
import { Efs } from "../components/efs";

export class DevelopmentStack extends Stack {
  constructor(scope: cdk.Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const BASE_PROPS: BaseConstructProps = {
      keyname: "",
      teamrole: Role.fromRoleArn(this, "", "", { mutable: false }),
      instanceProfile: { arn: "", name: "" },
    };

    // const s3Buckets = new S3Buckets(this, "S3Buckets", { ...BASE_PROPS });

    const vpcNetwork = new ManagedVpcNetwork(this, "ManagedVpcNetwork", {
      ...BASE_PROPS,
      natProvider: NatProvider.instance({ instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.NANO) }),
    });

    // const bastionHost = new BastionHost(this, "BastionHost", { ...BASE_PROPS, vpc: vpcNetwork.vpc });

    const rdsDatabase = new RdsDatabase(this, "RdsMysqlDatabase", {
      ...BASE_PROPS,
      vpc: vpcNetwork.vpc,
      engine: DatabaseInstanceEngine.mysql({ version: MysqlEngineVersion.VER_8_0_28 }),
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.SMALL),
      useSecret: false,
      credentials: {
        username: "",
        defaultDatabaseName: "",
        password: "",
      },
    });
    // rdsDatabase.securityGroup.addIngressRule(bastionHost.securityGroup, Port.tcp(3306));

    // https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.DBInstanceClass.html#Concepts.DBInstanceClass.RegionSupportAurora
    // const rdsAuroraDatabase = new RdsAuroraDatabase(this, "RdsAuroraDatabase", {
    //   ...BASE_PROPS,
    //   vpc: vpcNetwork.vpc,
    //   engine: DatabaseClusterEngine.auroraMysql({ version: AuroraMysqlEngineVersion.VER_2_10_2 }),
    //   instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    //   instances: 2,
    //   credentials: {
    //     username: "",
    //     defaultDatabaseName: "",
    //   },
    // });
    // rdsAuroraDatabase.securityGroup.addIngressRule(bastionHost.securityGroup, Port.tcp(3306));

    // const redisCluster = new ElasticacheRedisCluster(this, "RedisCluster", {
    //   ...BASE_PROPS,
    //   vpc: vpcNetwork.vpc,
    //   nodeType: "cache.t2.micro",
    // });
    // redisCluster.securityGroup.addIngressRule(bastionHost.securityGroup, Port.tcp(6379));

    // const redisReplicationGroup = new ElasticacheRedisReplicationGroup(this, "RedisReplicationGroup", {
    //   ...BASE_PROPS,
    //   vpc: vpcNetwork.vpc,
    // });
    // redisReplicationGroup.securityGroup.addIngressRule(bastionHost.securityGroup, Port.tcp(6379));

    // const memcachedCluster = new ElasticacheMemcachedCluster(this, "MemcachedCluster", {
    //   ...BASE_PROPS,
    //   vpc: vpcNetwork.vpc,
    // });
    // memcachedCluster.securityGroup.addIngressRule(bastionHost.securityGroup, Port.tcp(11211));

    // https://docs.aws.amazon.com/documentdb/latest/developerguide/db-instance-classes.html#db-instance-classes-by-region
    const documentdb = new DocumentDbCluster(this, "DocumentDbCluster", {
      ...BASE_PROPS,
      vpc: vpcNetwork.vpc,
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MEDIUM),
      tlsEnable: false,
      credentials: {
        username: "",
      },
    });
    // documentdb.securityGroup.addIngressRule(bastionHost.securityGroup, Port.tcp(3306));

    // const efs = new Efs(this, "Efs", {
    //   ...BASE_PROPS,
    //   vpc: vpcNetwork.vpc,
    // });
  }
}
