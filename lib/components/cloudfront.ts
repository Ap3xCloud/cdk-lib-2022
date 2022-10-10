import * as cdk from "@aws-cdk/core";
import { CfnOutput } from "@aws-cdk/core";
import {
  AllowedMethods,
  CachedMethods,
  CachePolicy,
  Distribution,
  HttpVersion,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  PriceClass,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from "@aws-cdk/aws-cloudfront";
import { ApplicationLoadBalancer } from "@aws-cdk/aws-elasticloadbalancingv2";
import { LoadBalancerV2Origin } from "@aws-cdk/aws-cloudfront-origins";
import { Bucket } from "@aws-cdk/aws-s3";
interface ConstructProps {
  applicationLoadBalancer: ApplicationLoadBalancer;
  logBucket?: Bucket;
  webAclId?: string;
}

export class CloudFront extends cdk.Construct {
  public readonly distribution: Distribution;

  constructor(scope: cdk.Construct, id: string, props: ConstructProps) {
    super(scope, id);

    this.distribution = new Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: new LoadBalancerV2Origin(props.applicationLoadBalancer, {
          protocolPolicy: OriginProtocolPolicy.HTTP_ONLY,
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
        responseHeadersPolicy: ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
      },
      httpVersion: HttpVersion.HTTP2,
      priceClass: PriceClass.PRICE_CLASS_ALL,
      enableLogging: true,
      logBucket: props.logBucket,
      logFilePrefix: "cloudfront",
      webAclId: props.webAclId,
    });

    new CfnOutput(this, "CloudFrontEndpoint", {
      value: this.distribution.distributionDomainName,
    });
  }
}
