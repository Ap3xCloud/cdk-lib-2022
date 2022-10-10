import * as cdk from "@aws-cdk/core";
import { SecurityGroup, UserData, Vpc, AmazonLinuxImage, AmazonLinuxGeneration, Port, LaunchTemplate, InstanceType, IVpc, CfnLaunchTemplate, SubnetType } from "@aws-cdk/aws-ec2";
import { ApplicationTargetGroup, TargetGroupLoadBalancingAlgorithmType, TargetType } from "@aws-cdk/aws-elasticloadbalancingv2";
import { BaseConstructProps } from "../utils";
import { AutoScalingGroup, GroupMetrics, TargetTrackingScalingPolicy, UpdatePolicy } from "@aws-cdk/aws-autoscaling";
import { Efs } from "./efs";
import { ElasticacheMemcachedCluster } from "./elasticache-memcached-cluster";
import { ElasticacheRedisCluster } from "./elasticache-redis-cluster";
import { ElasticacheRedisReplicationGroup } from "./elasticache-redis-replication-group";
import { RdsAuroraDatabase } from "./rds-aurora-database";
import { RdsDatabase } from "./rds-database";
import { Duration, Fn } from "@aws-cdk/core";
import { DocumentDbCluster } from "./documentdb";

interface ConstructProps extends BaseConstructProps {
  vpc: IVpc;
  name: string;
  binaryUrl: string;
  targetGroup?: ApplicationTargetGroup;
  instanceType: InstanceType;
  services?: {
    rdsDatabase?: RdsDatabase;
    rdsAuroraDatabase?: RdsAuroraDatabase;
    redis?: ElasticacheRedisCluster | ElasticacheRedisReplicationGroup;
    memcached?: ElasticacheMemcachedCluster;
    efs?: Efs;
    documentdb?: DocumentDbCluster;
  };
}

export class Ec2Service extends cdk.Construct {
  public readonly securityGroup: SecurityGroup;
  public readonly targetGroup: ApplicationTargetGroup;
  public readonly autoScalingGroup: AutoScalingGroup;

  constructor(scope: cdk.Construct, id: string, props: ConstructProps) {
    super(scope, id);

    this.securityGroup = new SecurityGroup(this, "SecurityGroup", { vpc: props.vpc });

    const userData = UserData.forLinux({ shebang: "#!/bin/bash -xe" });
    userData.addCommands("cd /root");
    // userData.addCommands("sudo yum install amazon-cloudwatch-agent -y");
    // userData.addCommands("mkdir -p /usr/share/collectd/");
    // userData.addCommands("touch /usr/share/collectd/types.db");
    // userData.addCommands(
    //   `echo '{"agent":{"metrics_collection_interval":60,"run_as_user":"root"},"logs":{"logs_collected":{"files":{"collect_list":[{"file_path":"/root/app_logs","log_group_name":"${props.name}_app_logs","log_stream_name":"{instance_id}"}]}}},"metrics":{"append_dimensions":{"AutoScalingGroupName":"\${aws:AutoScalingGroupName}","ImageId":"\${aws:ImageId}","InstanceId":"\${aws:InstanceId}","InstanceType":"\${aws:InstanceType}"},"metrics_collected":{"collectd":{"metrics_aggregation_interval":60},"disk":{"measurement":["used_percent"],"metrics_collection_interval":60,"resources":["*"]},"mem":{"measurement":["mem_used_percent"],"metrics_collection_interval":60},"statsd":{"metrics_aggregation_interval":60,"metrics_collection_interval":10,"service_address":":8125"}}}}' > /opt/aws/amazon-cloudwatch-agent/bin/config.json`,
    // );
    // userData.addCommands("touch app_logs");
    // userData.addCommands("/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/bin/config.json -s");
    userData.addCommands("yum install -y jq wget");
    userData.addCommands(`wget --no-check-certificate --tries=100 ${props.binaryUrl} -O server`);
    userData.addCommands("chmod ugo+rwx server");
    userData.addCommands('echo \\"LogLocation\\" = \\"/root/\\" > server.ini');
    if (props.services?.redis) {
      userData.addCommands(`echo \\"RedisHost\\" = \\"${props.services.redis.endpoint.hostname}\\" >> server.ini`);
      userData.addCommands(`echo \\"RedisPort\\" = \\"${props.services.redis.endpoint.port}\\" >> server.ini`);
      props.services.redis.securityGroup.addIngressRule(this.securityGroup, Port.tcp(6379));
    }
    if (props.services?.memcached) {
      userData.addCommands(`echo \\"MemcacheHost\\" = \\"${props.services.memcached.endpoint.hostname}\\" >> server.ini`);
      userData.addCommands(`echo \\"MemcachePort\\" = \\"${props.services.memcached.endpoint.port}\\" >> server.ini`);
      props.services.memcached.securityGroup.addIngressRule(this.securityGroup, Port.tcp(11211));
    }
    if (props.services?.rdsDatabase) {
      if (props.services.rdsDatabase.instance.engine?.engineType === "mysql") {
        userData.addCommands(`echo \\"MysqlHost\\" = \\"${props.services.rdsDatabase.instance.dbInstanceEndpointAddress}\\" >> server.ini`);
        userData.addCommands(`echo \\"MysqlPort\\" = \\"${props.services.rdsDatabase.instance.dbInstanceEndpointPort}\\" >> server.ini`);
        if (props.services.rdsDatabase.useSecret) {
          userData.addCommands(
            Fn.join("", [
              `echo \\"MysqlUser\\" = \\"$(aws secretsmanager get-secret-value --secret-id `,
              Fn.select(0, Fn.split("-", props.services.rdsDatabase.secret.secretName)),
              ` --query SecretString --output text --region ${cdk.Stack.of(this).region} | jq -r .username)\\" >> server.ini`,
            ]),
          );
          userData.addCommands(
            Fn.join("", [
              `echo \\"MysqlPass\\" = \\"$(aws secretsmanager get-secret-value --secret-id `,
              Fn.select(0, Fn.split("-", props.services.rdsDatabase.secret.secretName)),
              ` --query SecretString --output text --region ${cdk.Stack.of(this).region} | jq -r .password)\\" >> server.ini`,
            ]),
          );
          userData.addCommands(
            Fn.join("", [
              `echo \\"MysqlDb\\" = \\"$(aws secretsmanager get-secret-value --secret-id `,
              Fn.select(0, Fn.split("-", props.services.rdsDatabase.secret.secretName)),
              ` --query SecretString --output text --region ${cdk.Stack.of(this).region} | jq -r .dbname)\\" >> server.ini`,
            ]),
          );
        } else {
          userData.addCommands(`echo \\"MysqlUser\\" = \\"${props.services.rdsDatabase.credentials.username}\\" >> server.ini`);
          userData.addCommands(`echo \\"MysqlPass\\" = \\"${props.services.rdsDatabase.credentials.password}\\" >> server.ini`);
          userData.addCommands(`echo \\"MysqlDb\\" = \\"${props.services.rdsDatabase.credentials.defaultDatabaseName}\\" >> server.ini`);
        }
        // userData.addCommands(`echo \\"MysqlUser\\" = \\"${props.services.rdsDatabase.secret.secretValueFromJson("username")}\\" >> server.ini`);
        // userData.addCommands(`echo \\"MysqlPass\\" = \\"${props.services.rdsDatabase.secret.secretValueFromJson("password")}\\" >> server.ini`);
        // userData.addCommands(`echo \\"MysqlDb\\" = \\"${props.services.rdsDatabase.secret.secretValueFromJson("dbname")}\\" >> server.ini`);
        props.services.rdsDatabase.securityGroup.addIngressRule(this.securityGroup, Port.tcp(3306));
      } else if (props.services.rdsDatabase.instance.engine?.engineType === "postgres") {
        userData.addCommands(`echo \\"PgsqlHost\\" = \\"${props.services.rdsDatabase.instance.dbInstanceEndpointAddress}\\" >> server.ini`);
        userData.addCommands(`echo \\"PgsqlPort\\" = \\"${props.services.rdsDatabase.instance.dbInstanceEndpointPort}\\" >> server.ini`);
        if (props.services.rdsDatabase.useSecret) {
          userData.addCommands(
            Fn.join("", [
              `echo \\"PgsqlUser\\" = \\"$(aws secretsmanager get-secret-value --secret-id `,
              Fn.select(0, Fn.split("-", props.services.rdsDatabase.secret.secretName)),
              "-",
              Fn.select(1, Fn.split("-", props.services.rdsDatabase.secret.secretName)),
              ` --query SecretString --output text --region ${cdk.Stack.of(this).region} | jq -r .username)\\" >> server.ini`,
            ]),
          );
          userData.addCommands(
            Fn.join("", [
              `echo \\"PgsqlPass\\" = \\"$(aws secretsmanager get-secret-value --secret-id `,
              Fn.select(0, Fn.split("-", props.services.rdsDatabase.secret.secretName)),
              "-",
              Fn.select(1, Fn.split("-", props.services.rdsDatabase.secret.secretName)),
              ` --query SecretString --output text --region ${cdk.Stack.of(this).region} | jq -r .password)\\" >> server.ini`,
            ]),
          );
          userData.addCommands(
            Fn.join("", [
              `echo \\"PgsqlDb\\" = \\"$(aws secretsmanager get-secret-value --secret-id `,
              Fn.select(0, Fn.split("-", props.services.rdsDatabase.secret.secretName)),
              "-",
              Fn.select(1, Fn.split("-", props.services.rdsDatabase.secret.secretName)),
              ` --query SecretString --output text --region ${cdk.Stack.of(this).region} | jq -r .dbname)\\" >> server.ini`,
            ]),
          );
        } else {
          userData.addCommands(`echo \\"PgsqlUser\\" = \\"${props.services.rdsDatabase.credentials.username}\\" >> server.ini`);
          userData.addCommands(`echo \\"PgsqlPass\\" = \\"${props.services.rdsDatabase.credentials.password}\\" >> server.ini`);
          userData.addCommands(`echo \\"PgsqlDb\\" = \\"${props.services.rdsDatabase.credentials.defaultDatabaseName}\\" >> server.ini`);
        }
        // userData.addCommands(`echo \\"PgsqlUser\\" = \\"${props.services.rdsDatabase.secret.secretValueFromJson("username")}\\" >> server.ini`);
        // userData.addCommands(`echo \\"PgsqlPass\\" = \\"${props.services.rdsDatabase.secret.secretValueFromJson("password")}\\" >> server.ini`);
        // userData.addCommands(`echo \\"PgsqlDb\\" = \\"${props.services.rdsDatabase.secret.secretValueFromJson("dbname")}\\" >> server.ini`);
        props.services.rdsDatabase.securityGroup.addIngressRule(this.securityGroup, Port.tcp(5432));
      }
    }
    if (props.services?.rdsAuroraDatabase) {
      if (props.services.rdsAuroraDatabase.cluster.engine?.engineType === "aurora" || props.services.rdsAuroraDatabase.cluster.engine?.engineType === "aurora-mysql") {
        userData.addCommands(`echo \\"MysqlHost\\" = \\"${props.services.rdsAuroraDatabase.cluster.clusterEndpoint.hostname}\\" >> server.ini`);
        userData.addCommands(`echo \\"MysqlPort\\" = \\"${props.services.rdsAuroraDatabase.cluster.clusterEndpoint.port}\\" >> server.ini`);
        userData.addCommands(`echo \\"MysqlUser\\" = \\"${props.services.rdsAuroraDatabase.secret.secretValueFromJson("username")}\\" >> server.ini`);
        userData.addCommands(`echo \\"MysqlPass\\" = \\"${props.services.rdsAuroraDatabase.secret.secretValueFromJson("password")}\\" >> server.ini`);
        userData.addCommands(`echo \\"MysqlDb\\" = \\"${props.services.rdsAuroraDatabase.secret.secretValueFromJson("dbname")}\\" >> server.ini`);
        props.services.rdsAuroraDatabase.securityGroup.addIngressRule(this.securityGroup, Port.tcp(3306));
      } else if (props.services.rdsAuroraDatabase.cluster.engine?.engineType === "aurora-postgres") {
        userData.addCommands(`echo \\"PgsqlHost\\" = \\"${props.services.rdsAuroraDatabase.cluster.clusterEndpoint.hostname}\\" >> server.ini`);
        userData.addCommands(`echo \\"PgsqlPort\\" = \\"${props.services.rdsAuroraDatabase.cluster.clusterEndpoint.port}\\" >> server.ini`);
        userData.addCommands(`echo \\"PgsqlUser\\" = \\"${props.services.rdsAuroraDatabase.secret.secretValueFromJson("username")}\\" >> server.ini`);
        userData.addCommands(`echo \\"PgsqlPass\\" = \\"${props.services.rdsAuroraDatabase.secret.secretValueFromJson("password")}\\" >> server.ini`);
        userData.addCommands(`echo \\"PgsqlDb\\" = \\"${props.services.rdsAuroraDatabase.secret.secretValueFromJson("dbname")}\\" >> server.ini`);
        props.services.rdsAuroraDatabase.securityGroup.addIngressRule(this.securityGroup, Port.tcp(5432));
      }
    }
    if (props.services?.efs) {
      userData.addCommands("mkdir /efs");
      userData.addCommands(
        `mount -t nfs -o nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport ${props.services.efs.fileSystem.fileSystemId}.efs.${
          cdk.Stack.of(this).region
        }.amazonaws.com:/ /efs`,
      );
      userData.addCommands('echo \\"FsPath\\" = \\"/efs/\\" >> server.ini');
      props.services.efs.fileSystem.connections.allowFrom(this.securityGroup, Port.tcp(2049));
    }
    if (props.services?.documentdb) {
      userData.addCommands("wget https://s3.amazonaws.com/rds-downloads/rds-combined-ca-bundle.pem");
      userData.addCommands(`echo \\"MongoDbHost\\" = \\"${props.services.documentdb.cluster.clusterEndpoint.hostname}\\" >> server.ini`);
      userData.addCommands(`echo \\"MongoDbPort\\" = \\"${props.services.documentdb.cluster.clusterEndpoint.port}\\" >> server.ini`);
      if (props.services.documentdb.cluster.secret) {
        userData.addCommands(
          Fn.join("", [
            `echo \\"MongoDbUser\\" = \\"$(aws secretsmanager get-secret-value --secret-id `,
            Fn.select(0, Fn.split("-", props.services.documentdb.cluster.secret.secretName)),
            "-",
            Fn.select(1, Fn.split("-", props.services.documentdb.cluster.secret.secretName)),
            ` --query SecretString --output text --region ${cdk.Stack.of(this).region} | jq -r .username)\\" >> server.ini`,
          ]),
        );
        userData.addCommands(
          Fn.join("", [
            `echo \\"MongoDbPass\\" = \\"$(aws secretsmanager get-secret-value --secret-id `,
            Fn.select(0, Fn.split("-", props.services.documentdb.cluster.secret.secretName)),
            "-",
            Fn.select(1, Fn.split("-", props.services.documentdb.cluster.secret.secretName)),
            ` --query SecretString --output text --region ${cdk.Stack.of(this).region} | jq -r .password)\\" >> server.ini`,
          ]),
        );
        // userData.addCommands(`echo \\"MongoDbUser\\" = \\"${props.services.documentdb.cluster.secret.secretValueFromJson("username")}\\" >> server.ini`);
        // userData.addCommands(`echo \\"MongoDbPass\\" = \\"${props.services.documentdb.cluster.secret.secretValueFromJson("password")}\\" >> server.ini`);
      } else {
        userData.addCommands(`echo \\"MongoDbUser\\" = \\"${props.services.documentdb.credentials.username}\\" >> server.ini`);
        userData.addCommands(`echo \\"MongoDbPass\\" = \\"${props.services.documentdb.credentials.username}\\" >> server.ini`);
      }
      userData.addCommands(`echo \\"MongoDbDatabase\\" = \\"unicorndb\\" >> server.ini`);
      userData.addCommands(`echo \\"MongoDbCollection\\" = \\"unicorntable\\" >> server.ini`);
      userData.addCommands('echo \\"MongoDbCAFilePath\\" = \\"rds-combined-ca-bundle.pem\\" >> server.ini');
      userData.addCommands(`echo \\"MongoDbEnableSSL\\" = ${props.services.documentdb.tlsEnable ? "true" : "false"} >> server.ini`);
      props.services.documentdb.securityGroup.addIngressRule(this.securityGroup, Port.tcp(27017));
    }
    userData.addCommands("chmod ugo+rwx server.ini");
    userData.addCommands("pwd");
    userData.addCommands("cat server.ini");
    userData.addCommands("ls -als");
    userData.addCommands("/root/server");
    userData.addCommands("shutdown -h now");

    if (props.targetGroup) {
      this.targetGroup = props.targetGroup;
    } else {
      this.targetGroup = new ApplicationTargetGroup(this, "TargetGroup", {
        targetType: TargetType.INSTANCE,
        // slowStart: Duration.seconds(3),
        port: 80,
        loadBalancingAlgorithmType: TargetGroupLoadBalancingAlgorithmType.LEAST_OUTSTANDING_REQUESTS,
        vpc: props.vpc,
        healthCheck: {
          path: "/healthcheck",
        },
      });
    }

    const launchTemplate = new LaunchTemplate(this, "LaunchTemplate", {
      userData: userData,
      instanceType: props.instanceType,
      securityGroup: this.securityGroup,
      role: props.teamrole,
      keyName: props.keyname,
      detailedMonitoring: true,
      machineImage: new AmazonLinuxImage({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    });
    // if (launchTemplate.role) {
    const cfnLaunchTemplate = launchTemplate.node.findChild("Resource") as CfnLaunchTemplate;
    // cfnLaunchTemplate.addPropertyDeletionOverride("LaunchTemplateData.IamInstanceProfile");
    cfnLaunchTemplate.addPropertyOverride("LaunchTemplateData.IamInstanceProfile", { Arn: props.instanceProfile.arn });
    launchTemplate.node.tryRemoveChild("Profile");
    // }

    this.autoScalingGroup = new AutoScalingGroup(this, "AutoScalingGroup", {
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_NAT },
      launchTemplate,
      desiredCapacity: 1,
      minCapacity: 1,
      maxCapacity: 120,
      vpc: props.vpc,
      groupMetrics: [GroupMetrics.all()],
      updatePolicy: UpdatePolicy.replacingUpdate(),
    });
    this.autoScalingGroup.attachToApplicationTargetGroup(this.targetGroup);
  }

  public enableScaling() {
    new TargetTrackingScalingPolicy(this, "ResponseTimeTargetTrackingScalingPolicy", {
      autoScalingGroup: this.autoScalingGroup,
      targetValue: 5,
      customMetric: this.targetGroup.metricTargetResponseTime({ period: Duration.minutes(1), statistic: "max" }),
    });

    new TargetTrackingScalingPolicy(this, "RequestCountTargetTrackingScalingPolicy", {
      autoScalingGroup: this.autoScalingGroup,
      targetValue: 5,
      customMetric: this.targetGroup.metricRequestCountPerTarget({ period: Duration.minutes(1), statistic: "max" }),
    });
  }
}
