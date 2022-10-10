import { IVpc, Vpc } from "@aws-cdk/aws-ec2";
import { DockerImageAsset } from "@aws-cdk/aws-ecr-assets";
import { AsgCapacityProvider, AwsLogDriver, Cluster, ContainerImage, Ec2Service, Ec2TaskDefinition, Protocol, Scope, Secret } from "@aws-cdk/aws-ecs";
import * as cdk from "@aws-cdk/core";
import { BaseConstructProps } from "../utils";
import { RdsAuroraDatabase } from "./rds-aurora-database";
import { RdsDatabase } from "./rds-database";
import { ElasticacheRedisReplicationGroup } from "./elasticache-redis-replication-group";
import { ElasticacheRedisCluster } from "./elasticache-redis-cluster";
import { ElasticacheMemcachedCluster } from "./elasticache-memcached-cluster";
import { Efs } from "./efs";
import { ApplicationTargetGroup, TargetGroupLoadBalancingAlgorithmType, TargetType } from "@aws-cdk/aws-elasticloadbalancingv2";
import { Duration } from "@aws-cdk/core";
import { DocumentDbCluster } from "./documentdb";

interface ConstructProps extends BaseConstructProps {
  vpc: IVpc;
  name: string;
  image: DockerImageAsset;
  cluster: Cluster;
  targetGroup?: ApplicationTargetGroup;
  capacityProviders: { onDemand: AsgCapacityProvider; spot: AsgCapacityProvider };
  services?: {
    rdsDatabase?: RdsDatabase;
    rdsAuroraDatabase?: RdsAuroraDatabase;
    redis?: ElasticacheRedisCluster | ElasticacheRedisReplicationGroup;
    memcached?: ElasticacheMemcachedCluster;
    efs?: Efs;
    documentdb?: DocumentDbCluster;
  };
}

export class EcsEc2Service extends cdk.Construct {
  public readonly taskDefinition: Ec2TaskDefinition;
  public readonly service: Ec2Service;
  public readonly targetGroup: ApplicationTargetGroup;

  constructor(scope: cdk.Construct, id: string, props: ConstructProps) {
    super(scope, id);

    this.taskDefinition = new Ec2TaskDefinition(this, "TaskDefinition", {
      family: props.name,
      executionRole: props.teamrole,
      taskRole: props.teamrole,
    });

    const environment: { [key: string]: string } = {
      AWS_REGION: cdk.Stack.of(this).region,
    };
    const secret: { [key: string]: Secret } = {};

    if (props.services?.rdsDatabase) {
      console.log(props.services.rdsDatabase.instance.engine?.engineType);
      if (props.services.rdsDatabase.instance.engine?.engineType === "mysql") {
        environment["MYSQL_HOST"] = props.services.rdsDatabase.instance.dbInstanceEndpointAddress;
        environment["MYSQL_PORT"] = props.services.rdsDatabase.instance.dbInstanceEndpointPort;
        environment["MYSQL_USER"] = props.services.rdsDatabase.secret.secretValueFromJson("username").toString();
        // environment["MYSQL_PASSWORD"] = props.services.rdsDatabase.secret.secretValueFromJson("password").toString();
        secret["MYSQL_PASSWORD"] = Secret.fromSecretsManager(props.services.rdsDatabase.secret, "password");
        environment["MYSQL_DATABASE"] = props.services.rdsDatabase.secret.secretValueFromJson("dbname").toString();
      } else if (props.services.rdsDatabase.instance.engine?.engineType === "postgres") {
        environment["POSTGRES_HOST"] = props.services.rdsDatabase.instance.dbInstanceEndpointAddress;
        environment["POSTGRES_PORT"] = props.services.rdsDatabase.instance.dbInstanceEndpointPort;
        environment["POSTGRES_USER"] = props.services.rdsDatabase.secret.secretValueFromJson("username").toString();
        secret["POSTGRES_PASSWORD"] = Secret.fromSecretsManager(props.services.rdsDatabase.secret, "password");
        // environment["POSTGRES_PASSWORD"] = props.services.rdsDatabase.secret.secretValueFromJson("password").toString();
        environment["POSTGRES_DATABASE"] = props.services.rdsDatabase.secret.secretValueFromJson("dbname").toString();
        environment["POSTGRES_TABLE"] = ""; // TODO:
      }
    }

    if (props.services?.rdsAuroraDatabase) {
      console.log(props.services.rdsAuroraDatabase.cluster.engine?.engineType);
      if (props.services.rdsAuroraDatabase.cluster.engine?.engineType === "aurora" || props.services.rdsAuroraDatabase.cluster.engine?.engineType === "aurora-mysql") {
        environment["MYSQL_HOST"] = props.services.rdsAuroraDatabase.cluster.clusterEndpoint.hostname;
        environment["MYSQL_PORT"] = props.services.rdsAuroraDatabase.cluster.clusterEndpoint.port.toString();
        environment["MYSQL_USER"] = props.services.rdsAuroraDatabase.secret.secretValueFromJson("username").toString();
        // environment["MYSQL_PASSWORD"] = props.services.rdsAuroraDatabase.secret.secretValueFromJson("password").toString();
        secret["MYSQL_PASSWORD"] = Secret.fromSecretsManager(props.services.rdsAuroraDatabase.secret, "password");
        environment["MYSQL_DATABASE"] = props.services.rdsAuroraDatabase.secret.secretValueFromJson("dbname").toString();
      } else if (props.services.rdsAuroraDatabase.cluster.engine?.engineType === "aurora-postgres") {
        environment["POSTGRES_HOST"] = props.services.rdsAuroraDatabase.cluster.clusterEndpoint.hostname;
        environment["POSTGRES_PORT"] = props.services.rdsAuroraDatabase.cluster.clusterEndpoint.port.toString();
        environment["POSTGRES_USER"] = props.services.rdsAuroraDatabase.secret.secretValueFromJson("username").toString();
        // environment["POSTGRES_PASSWORD"] = props.services.rdsAuroraDatabase.secret.secretValueFromJson("password").toString();
        secret["POSTGRES_PASSWORD"] = Secret.fromSecretsManager(props.services.rdsAuroraDatabase.secret, "password");
        environment["POSTGRES_DATABASE"] = props.services.rdsAuroraDatabase.secret.secretValueFromJson("dbname").toString();
        environment["POSTGRES_TABLE"] = ""; // TODO:
      }
    }

    if (props.services?.documentdb) {
      environment["MONGODB_HOST"] = props.services.documentdb.cluster.clusterEndpoint.hostname;
      environment["MONGODB_PORT"] = props.services.documentdb.cluster.clusterEndpoint.port.toString();
      if (props.services.documentdb.cluster.secret) {
        secret["MONGODB_USER"] = Secret.fromSecretsManager(props.services.documentdb.cluster.secret, "username");
        secret["MONGODB_PASSWORD"] = Secret.fromSecretsManager(props.services.documentdb.cluster.secret, "password");
        // environment["MONGODB_USER"] = props.services.documentdb.cluster.secret.secretValueFromJson("username").toString();
        // environment["MONGODB_PASSWORD"] = props.services.documentdb.cluster.secret.secretValueFromJson("password").toString();
      }
      environment["MONGODB_DATABASE"] = "unicorndb";
      environment["MONGODB_COLLECTION"] = "unicorntable";
      environment["MONGODB_ENABLE_SSL"] = props.services.documentdb.tlsEnable ? "true" : "false";
    }

    if (props.services?.redis) {
      environment["REDIS_HOST"] = props.services.redis.endpoint.hostname;
      environment["REDIS_PORT"] = props.services.redis.endpoint.port;
    }

    if (props.services?.memcached) {
      environment["MEMCACHED_HOST"] = props.services.memcached.endpoint.hostname;
      environment["MEMCACHED_PORT"] = props.services.memcached.endpoint.port;
    }

    const container = this.taskDefinition.addContainer(`${props.name}`, {
      image: ContainerImage.fromDockerImageAsset(props.image),
      logging: new AwsLogDriver({ streamPrefix: `${props.name}/container` }),
      memoryLimitMiB: 512,
      cpu: 256,
      privileged: true,
      user: "root",
      environment: { ...environment },
      secrets: { ...secret },
      portMappings: [
        {
          hostPort: 0,
          containerPort: 80,
          protocol: Protocol.TCP,
        },
      ],
    });

    if (props.services?.efs) {
      container.addMountPoints({
        containerPath: "/root/efs",
        sourceVolume: "efs",
        readOnly: false,
      });
      this.taskDefinition.addVolume({
        name: "efs",
        efsVolumeConfiguration: {
          fileSystemId: props.services.efs.fileSystem.fileSystemId,
          rootDirectory: `/${props.name}`,
          transitEncryption: "ENABLED",
          authorizationConfig: {
            accessPointId: props.services.efs.accessPoint.accessPointId,
            iam: "DISABLED",
          },
        },
      });
    }

    this.service = new Ec2Service(this, "Service", {
      cluster: props.cluster,
      taskDefinition: this.taskDefinition,
      desiredCount: 1,
      capacityProviderStrategies: [
        { capacityProvider: props.capacityProviders.onDemand.capacityProviderName, base: 0, weight: 2 },
        { capacityProvider: props.capacityProviders.spot.capacityProviderName, base: 0, weight: 1 },
      ],
    });

    if (props.targetGroup) {
      this.targetGroup = props.targetGroup;
    } else {
      this.targetGroup = new ApplicationTargetGroup(this, "TargetGroup", {
        // slowStart: Duration.seconds(3),
        // targetType: TargetType.INSTANCE,
        port: 80,
        loadBalancingAlgorithmType: TargetGroupLoadBalancingAlgorithmType.LEAST_OUTSTANDING_REQUESTS,
        healthCheck: {
          path: "/healthcheck",
        },
        vpc: props.vpc,
      });
    }

    this.service.attachToApplicationTargetGroup(this.targetGroup);
  }

  public async enableScaling() {
    const scaling = this.service.autoScaleTaskCount({ minCapacity: 1, maxCapacity: 120 });

    scaling.scaleToTrackCustomMetric("TargetResponseTime", {
      targetValue: 5,
      metric: this.targetGroup.metricTargetResponseTime({ period: Duration.minutes(1), statistic: "max" }),
    });

    scaling.scaleToTrackCustomMetric("RequestCountPerTarget", {
      targetValue: 5,
      metric: this.targetGroup.metricRequestCountPerTarget({ period: Duration.minutes(1), statistic: "max" }),
    });
  }
}
