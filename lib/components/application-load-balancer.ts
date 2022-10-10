import * as cdk from "@aws-cdk/core";
import * as elbv2 from "@aws-cdk/aws-elasticloadbalancingv2";
import { BaseConstructProps } from "../utils";
import { CfnSecurityGroupIngress, IVpc, Peer, Port, SecurityGroup, SubnetType } from "@aws-cdk/aws-ec2";
import { Bucket } from "@aws-cdk/aws-s3";
import { CfnOutput, Duration } from "@aws-cdk/core";

interface ConstructProps extends BaseConstructProps {
  vpc: IVpc;
  cfPrefixListId?: string;
  logBucket?: Bucket;
}

interface RegisterProps {
  name: string;
  priority: number;
  targetGroup: elbv2.ApplicationTargetGroup;
  conditions: elbv2.ListenerCondition[];
}

export class ApplicationLoadBalancer extends cdk.Construct {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly httpListener: elbv2.ApplicationListener;
  public readonly defaultTargetGroup: elbv2.ApplicationTargetGroup;
  public readonly securityGroup: SecurityGroup;

  constructor(scope: cdk.Construct, id: string, props: ConstructProps) {
    super(scope, id);

    this.securityGroup = new SecurityGroup(this, "SecurityGroup", { vpc: props.vpc });

    if (props.cfPrefixListId) {
      new CfnSecurityGroupIngress(this, "AllowFromCloudFront", {
        ipProtocol: "tcp",
        sourcePrefixListId: props.cfPrefixListId,
        fromPort: 80,
        toPort: 80,
        groupId: this.securityGroup.securityGroupId,
      });
    } else {
      this.securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(80));
    }

    this.alb = new elbv2.ApplicationLoadBalancer(this, "ApplicationLoadBalancer", {
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
      internetFacing: true,
      deletionProtection: false,
      securityGroup: this.securityGroup,
    });

    if (props.logBucket) {
      this.alb.logAccessLogs(props.logBucket, "application-load-balancer");
    }

    this.httpListener = this.alb.addListener("http", {
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 80,
      open: true,
    });

    this.defaultTargetGroup = new elbv2.ApplicationTargetGroup(this, "DefaultTargetGroup", {
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 80,
      loadBalancingAlgorithmType: elbv2.TargetGroupLoadBalancingAlgorithmType.LEAST_OUTSTANDING_REQUESTS,
      vpc: props.vpc,
      // slowStart: Duration.seconds(3),
      healthCheck: {
        path: "/healthcheck",
      },
    });

    this.httpListener.addTargetGroups("default", {
      targetGroups: [this.defaultTargetGroup],
    });

    new CfnOutput(this, "ApplicationLoadBalancerEndpoint", {
      value: this.alb.loadBalancerDnsName,
    });
  }

  public register(props: RegisterProps) {
    if (props.targetGroup.targetGroupName !== this.defaultTargetGroup.targetGroupName) {
      if (!props.conditions.length) throw new Error("Conditions cannot empty");
      this.httpListener.addTargetGroups(props.name, {
        priority: props.priority,
        targetGroups: [props.targetGroup],
        conditions: [...props.conditions],
      });
    }
  }
}
