import * as cdk from "@aws-cdk/core";
import { Bucket, BucketEncryption } from "@aws-cdk/aws-s3";
import { BaseConstructProps } from "../utils";
import { Fn, RemovalPolicy } from "@aws-cdk/core";
import { AccountPrincipal, AccountRootPrincipal, Effect, PolicyStatement, ServicePrincipal } from "@aws-cdk/aws-iam";

const ElasticLoadBalancerAccountId: { [key: string]: string } = {
  "us-east-1": "127311923021",
  "us-east-2": "033677994240",
  "us-west-1": "027434742980",
  "us-west-2": "797873946194",
  "af-south-1": "098369216593",
  "ca-central-1": "985666609251",
  "eu-central-1": "054676820928",
  "eu-west-1": "156460612806",
  "eu-west-2": "652711504416",
  "eu-south-1": "635631232127",
  "eu-west-3": "009996457667",
  "eu-north-1": "897822967062",
  "ap-east-1": "754344448648",
  "ap-northeast-1": "582318560864",
  "ap-northeast-2": "600734575887",
  "ap-northeast-3": "383597477331",
  "ap-southeast-1": "114774131450",
  "ap-southeast-2": "783225319266",
  "ap-south-1": "718504428378",
  "me-south-1": "076674570225",
  "sa-east-1": "507241528517",
};

interface ConstructProps extends BaseConstructProps {}

export class S3Buckets extends cdk.Construct {
  public readonly log: Bucket;
  constructor(scope: cdk.Construct, id: string, props: ConstructProps) {
    super(scope, id);

    this.log = new Bucket(this, "Log", {
      // autoDeleteObjects: true,
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.log.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new AccountPrincipal(ElasticLoadBalancerAccountId[cdk.Stack.of(this).region])],
        actions: ["s3:PutObject"],
        resources: [Fn.join("", [this.log.bucketArn, `/application-load-balancer/AWSLogs/${cdk.Stack.of(this).account}/*`])],
      }),
    );

    this.log.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new ServicePrincipal("delivery.logs.amazonaws.com")],
        actions: ["s3:PutObject"],
        resources: [Fn.join("", [this.log.bucketArn, `/vpc-flow-log/AWSLogs/${cdk.Stack.of(this).account}/*`])],
        conditions: {
          StringEquals: {
            "aws:SourceAccount": cdk.Stack.of(this).account,
            "s3:x-amz-acl": "bucket-owner-full-control",
          },
          ArnLike: {
            "aws:SourceArn": `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:*`,
          },
        },
      }),
    );

    this.log.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new ServicePrincipal("delivery.logs.amazonaws.com")],
        actions: ["s3:GetBucketAcl"],
        resources: [this.log.bucketArn],
        conditions: {
          StringEquals: {
            "aws:SourceAccount": cdk.Stack.of(this).account,
          },
          ArnLike: {
            "aws:SourceArn": `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:*`,
          },
        },
      }),
    );
  }
}
