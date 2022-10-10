import * as cdk from "@aws-cdk/core";
import { InstanceType, IVpc, SecurityGroup, UserData, Vpc } from "@aws-cdk/aws-ec2";
import { AsgCapacityProvider, Cluster, EcsOptimizedImage } from "@aws-cdk/aws-ecs";
import { AutoScalingGroup, CfnLaunchConfiguration, Monitoring } from "@aws-cdk/aws-autoscaling";
import { BaseConstructProps } from "../utils";
import { Fn } from "@aws-cdk/core";

interface ConstructProps extends BaseConstructProps {
  vpc: IVpc;
  instanceType: InstanceType;
  blockEc2MetadataAccess?: boolean;
}

export class EcsEc2Cluster extends cdk.Construct {
  public readonly cluster: Cluster;
  public readonly securityGroup: SecurityGroup;
  public readonly capacityProviders: { onDemand: AsgCapacityProvider; spot: AsgCapacityProvider };

  constructor(scope: cdk.Construct, id: string, props: ConstructProps) {
    super(scope, id);

    this.securityGroup = new SecurityGroup(this, "SecurityGroup", { vpc: props.vpc });

    this.cluster = new Cluster(this, "Cluster", {
      vpc: props.vpc,
      enableFargateCapacityProviders: true,
      containerInsights: true,
    });

    const userData = UserData.forLinux();
    userData.addCommands(Fn.join("", ['echo "ECS_CLUSTER=', this.cluster.clusterName, '" >> /etc/ecs/ecs.config']));
    userData.addCommands("echo ECS_ENABLE_SPOT_INSTANCE_DRAINING=true >> /etc/ecs/ecs.config");
    if (props.blockEc2MetadataAccess) {
      userData.addCommands("echo ECS_AWSVPC_BLOCK_IMDS=true >> /etc/ecs/ecs.config");
      userData.addCommands("sudo iptables --insert FORWARD 1 --in-interface docker+ --destination 169.254.169.254/32 --jump DROP");
      userData.addCommands("sudo service iptables save");
    }

    const onDemandAutoScalingGroup = new AutoScalingGroup(this, "OnDemandAutoScalingGroup", {
      vpc: props.vpc,
      instanceType: props.instanceType,
      instanceMonitoring: Monitoring.DETAILED,
      machineImage: EcsOptimizedImage.amazonLinux2(),
      minCapacity: 1,
      desiredCapacity: 1,
      maxCapacity: 120,
      role: props.teamrole,
      keyName: props.keyname,
      securityGroup: this.securityGroup,
      userData,
    });
    const cfnOnDemandLaunchConfiguration = onDemandAutoScalingGroup.node.findChild("LaunchConfig") as CfnLaunchConfiguration;
    cfnOnDemandLaunchConfiguration.addPropertyOverride("IamInstanceProfile", props.instanceProfile.name);
    cfnOnDemandLaunchConfiguration.addPropertyOverride("UserData", Fn.base64(userData.render()));
    onDemandAutoScalingGroup.node.tryRemoveChild("InstanceProfile");

    const onDemandCapacityProvider = new AsgCapacityProvider(this, "OnDemandAsgCapacityProvider", {
      capacityProviderName: "EC2_ON_DEMAND",
      autoScalingGroup: onDemandAutoScalingGroup,
    });

    this.cluster.addAsgCapacityProvider(onDemandCapacityProvider);

    const spotAutoScalingGroup = new AutoScalingGroup(this, "SpotAutoScalingGroup", {
      vpc: props.vpc,
      instanceType: props.instanceType,
      instanceMonitoring: Monitoring.DETAILED,
      machineImage: EcsOptimizedImage.amazonLinux2(),
      minCapacity: 0,
      desiredCapacity: 0,
      maxCapacity: 60,
      role: props.teamrole,
      keyName: props.keyname,
      securityGroup: this.securityGroup,
      spotPrice: "1",
      userData,
    });
    const cfnSpotLaunchConfiguration = spotAutoScalingGroup.node.findChild("LaunchConfig") as CfnLaunchConfiguration;
    cfnSpotLaunchConfiguration.addPropertyOverride("IamInstanceProfile", props.instanceProfile.name);
    cfnSpotLaunchConfiguration.addPropertyOverride("UserData", Fn.base64(userData.render()));
    spotAutoScalingGroup.node.tryRemoveChild("InstanceProfile");

    const spotCapacityProvider = new AsgCapacityProvider(this, "SpotAsgCapacityProvider", {
      capacityProviderName: "EC2_SPOT",
      autoScalingGroup: spotAutoScalingGroup,
      spotInstanceDraining: true,
    });

    this.cluster.addAsgCapacityProvider(onDemandCapacityProvider);
    this.cluster.addAsgCapacityProvider(spotCapacityProvider);

    this.capacityProviders = {
      onDemand: onDemandCapacityProvider,
      spot: spotCapacityProvider,
    };
  }
}
