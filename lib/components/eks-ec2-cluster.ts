import { InstanceClass, InstanceSize, InstanceType, IVpc, SubnetType } from "@aws-cdk/aws-ec2";
import { Key } from "@aws-cdk/aws-kms";
import { AlbControllerVersion, Cluster, EndpointAccess, KubernetesVersion } from "@aws-cdk/aws-eks";
import * as cdk from "@aws-cdk/core";
import { BaseConstructProps } from "../utils";
import * as blueprints from "@aws-quickstart/eks-blueprints";

// const addOn = new blueprints.addons.ClusterAutoScalerAddOn();

interface ConstructProps extends BaseConstructProps {
  vpc: IVpc;
}

export class EksEc2CLUSTER extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: ConstructProps) {
    super(scope, id);

    const secretsEncryptionKey = new Key(this, "SecretsEncryptionKey");

    const cluster = new Cluster(this, "Cluster", {
      version: KubernetesVersion.V1_21,
      vpc: props.vpc,
      role: props.teamrole,
      mastersRole: props.teamrole,
      endpointAccess: EndpointAccess.PUBLIC_AND_PRIVATE,
      secretsEncryptionKey: secretsEncryptionKey,
      vpcSubnets: [{ subnetType: SubnetType.PRIVATE_WITH_NAT }],
      albController: {
        version: AlbControllerVersion.V2_4_1,
      },
      defaultCapacity: 0,
      //   defaultCapacityInstance: InstanceType.of(InstanceClass.T3, InstanceSize.MEDIUM),
    });
    cluster.addNodegroupCapacity("DefaultOnDemandNodeGroup", {
      subnets: { subnetType: SubnetType.PRIVATE_WITH_NAT },
      desiredSize: 3,
      maxSize: 240,
      minSize: 1,
      instanceTypes: [InstanceType.of(InstanceClass.T3A, InstanceSize.MEDIUM), InstanceType.of(InstanceClass.T3, InstanceSize.MEDIUM)],
    });

    // new blueprints.EksBlueprint(this, {
    //   id: "",
    //   addOns: [
    //     new blueprints.addons.MetricsServerAddOn(),
    //     new blueprints.addons.ClusterAutoScalerAddOn(),
    //     new blueprints.addons.CloudWatchAdotAddOn(),
    //     new blueprints.addons.AwsLoadBalancerControllerAddOn(),
    //     new blueprints.addons.VpcCniAddOn(),
    //     new blueprints.addons.EfsCsiDriverAddOn(),
    //   ],
    // });
  }
}
