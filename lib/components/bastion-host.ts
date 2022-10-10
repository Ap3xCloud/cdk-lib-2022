import * as cdk from "@aws-cdk/core";
import { BaseConstructProps } from "../utils";
import { Instance, SubnetType, InstanceClass, InstanceSize, InstanceType, MachineImage, AmazonLinuxGeneration, Vpc, SecurityGroup, Peer, Port, CfnInstance, IVpc } from "@aws-cdk/aws-ec2";
import { CfnOutput } from "@aws-cdk/core";

interface ConstructProps extends BaseConstructProps {
  vpc: IVpc;
}

export class BastionHost extends cdk.Construct {
  // public readonly instance: Instance;
  public readonly securityGroup: SecurityGroup;

  constructor(scope: cdk.Construct, id: string, props: ConstructProps) {
    super(scope, id);

    this.securityGroup = new SecurityGroup(this, "SecurityGroup", { vpc: props.vpc });
    this.securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(22));

    const cfnInstance = new CfnInstance(this, "CfnInstance", {
      imageId: MachineImage.lookup({
        name: "ubuntu/images/hvm-ssd/ubuntu-focal-*",
        owners: ["099720109477"],
        filters: { architecture: ["x86_64"] },
      }).getImage(this).imageId,
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MICRO).toString(),
      iamInstanceProfile: props.instanceProfile.name,
      subnetId: props.vpc.publicSubnets[0].subnetId,
      securityGroupIds: [this.securityGroup.securityGroupId],
      keyName: props.keyname,
    });

    new CfnOutput(this, "BastionHostPublicIp", {
      value: cfnInstance.attrPublicIp,
    });

    // this.instance = new Instance(this, "Instance", {
    //   vpc: props.vpc,
    //   vpcSubnets: { subnetType: SubnetType.PUBLIC },
    //   securityGroup: this.securityGroup,
    //   instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),
    //   machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    //   role: props.teamrole,
    // });
  }
}
