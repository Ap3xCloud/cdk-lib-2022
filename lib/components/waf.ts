import * as cdk from "@aws-cdk/core";
import { CfnWebACL, CfnIPSet } from "@aws-cdk/aws-wafv2";
import _ from "lodash";
import { BaseConstructProps } from "../utils";

export enum ManagedRuleGroupVendor {
  AWS = "AWS",
}

export enum ManagedRuleGroup {
  CORE = "CORE",
  ADMIN_PROTECTION = "ADMIN_PROTECTION",
  KNOWN_BAD_INPUTS = "KNOWN_BAD_INPUTS",
  SQL_I = "SQL_I",
  LINUX = "LINUX",
  UNIX = "UNIX",
  WINDOWS = "WINDOWS",
  PHP = "PHP",
  WORDPRESS = "WORDPRESS",
  IP_REPUTATION = "IP_REPUTATION",
  ANONYMOUS_IP = "ANONYMOUS_IP",
  BOT_CONTROL = "BOT_CONTROL",
}

const AwsManagedRulGroupMapping: {
  [key in ManagedRuleGroup]: {
    name: string;
    wcu: number;
    vendor: ManagedRuleGroupVendor;
  };
} = {
  [ManagedRuleGroup.CORE]: {
    name: "AWSManagedRulesCommonRuleSet",
    wcu: 700,
    vendor: ManagedRuleGroupVendor.AWS,
  },
  [ManagedRuleGroup.ADMIN_PROTECTION]: {
    name: "AWSManagedRulesAdminProtectionRuleSet",
    wcu: 100,
    vendor: ManagedRuleGroupVendor.AWS,
  },
  [ManagedRuleGroup.KNOWN_BAD_INPUTS]: {
    name: "AWSManagedRulesKnownBadInputsRuleSet",
    wcu: 200,
    vendor: ManagedRuleGroupVendor.AWS,
  },
  [ManagedRuleGroup.SQL_I]: {
    name: "AWSManagedRulesSQLiRuleSet",
    wcu: 200,
    vendor: ManagedRuleGroupVendor.AWS,
  },
  [ManagedRuleGroup.LINUX]: {
    name: "AWSManagedRulesLinuxRuleSet",
    wcu: 200,
    vendor: ManagedRuleGroupVendor.AWS,
  },
  [ManagedRuleGroup.UNIX]: {
    name: "AWSManagedRulesUnixRuleSet",
    wcu: 100,
    vendor: ManagedRuleGroupVendor.AWS,
  },
  [ManagedRuleGroup.WINDOWS]: {
    name: "AWSManagedRulesWindowsRuleSet",
    wcu: 200,
    vendor: ManagedRuleGroupVendor.AWS,
  },
  [ManagedRuleGroup.PHP]: {
    name: "AWSManagedRulesPHPRuleSet",
    wcu: 100,
    vendor: ManagedRuleGroupVendor.AWS,
  },
  [ManagedRuleGroup.WORDPRESS]: {
    name: "AWSManagedRulesWordPressRuleSet",
    wcu: 100,
    vendor: ManagedRuleGroupVendor.AWS,
  },
  [ManagedRuleGroup.IP_REPUTATION]: {
    name: "AWSManagedRulesAmazonIpReputationList",
    wcu: 25,
    vendor: ManagedRuleGroupVendor.AWS,
  },
  [ManagedRuleGroup.ANONYMOUS_IP]: {
    name: "AWSManagedRulesAnonymousIpList",
    wcu: 50,
    vendor: ManagedRuleGroupVendor.AWS,
  },
  [ManagedRuleGroup.BOT_CONTROL]: {
    name: "AWSManagedRulesBotControlRuleSet",
    wcu: 50,
    vendor: ManagedRuleGroupVendor.AWS,
  },
};

export enum WafScope {
  CLOUDFRONT = "CLOUDFRONT",
  REGIONAL = "REGIONAL",
}

interface IRateLimitRules {
  default: {
    rateLimit: number;
  };
  uri?: {
    paths: string[];
    rateLimit: number;
  };
}

interface ConstructProps extends BaseConstructProps {
  enabled: boolean;
  scope: WafScope;
  whitelistIp?: string[];
  whitelistIpv6Ip?: string[];
  blacklistIp?: string[];
  blacklistIpv6Ip?: string[];
  rules: ManagedRuleGroup[];
  rateLimit?: IRateLimitRules;
  // loggingBucket: IBucket;
}

export class Waf extends cdk.Construct {
  public readonly enabled: boolean;
  public readonly webAcl: CfnWebACL;
  public readonly whitelistIpSet?: CfnIPSet;
  public readonly whitelistIpv6IpSet?: CfnIPSet;
  public readonly blacklistIpSet?: CfnIPSet;
  public readonly blacklistIpv6IpSet?: CfnIPSet;

  constructor(scope: cdk.Construct, id: string, props: ConstructProps) {
    super(scope, id);

    this.enabled = props.enabled;

    const totalWcu = props.rules.map((rule) => AwsManagedRulGroupMapping[rule].wcu).reduce((prev, curr) => prev + curr) + (props.rateLimit?.uri?.paths.length || 0) * 2 + 2;
    if (totalWcu > 1500) throw new Error(`The total WCU is larger than the maximum web ACL WCU - 1,500, current WCU is ${totalWcu}`);

    if (props.enabled) {
      const rules: CfnWebACL.RuleProperty[] = [
        ...props.rules.map((rule, i) => ({
          name: `RuleWith${AwsManagedRulGroupMapping[rule].name}`,
          priority: 10 + i,
          overrideAction: { none: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: `${AwsManagedRulGroupMapping[rule].name.replace("AWSManagedRules", "")}Metric`,
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: AwsManagedRulGroupMapping[rule].vendor,
              name: AwsManagedRulGroupMapping[rule].name,
            },
          },
        })),
      ];

      if (props.rateLimit) {
        rules.push({
          name: "RuleWithRateLimit",
          priority: 100 + (props.rateLimit.uri?.paths.length || 0),
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: "DefaultRateLimitCustomRuleMetric",
          },
          statement: {
            rateBasedStatement: {
              limit: props.rateLimit.default.rateLimit,
              aggregateKeyType: "IP",
            },
          },
        });
        if (props.rateLimit.uri) {
          props.rateLimit.uri.paths.forEach((path) => {
            rules.push(
              ...props.rateLimit!.uri!.paths.map<CfnWebACL.RuleProperty>((path, i) => ({
                name: `RuleWith${_.startCase(path)}PageRateLimit`,
                priority: 100 + i,
                action: { block: {} },
                visibilityConfig: {
                  sampledRequestsEnabled: true,
                  cloudWatchMetricsEnabled: true,
                  metricName: `${_.startCase(path)}PageRateLimitCustomRuleMetric`,
                },
                statement: {
                  rateBasedStatement: {
                    limit: props.rateLimit!.uri?.rateLimit || 1000,
                    aggregateKeyType: "IP",
                    scopeDownStatement: {
                      byteMatchStatement: {
                        fieldToMatch: { uriPath: {} },
                        positionalConstraint: "STARTS_WITH",
                        searchString: path,
                        textTransformations: [{ type: "NONE", priority: 0 }],
                      },
                    },
                  },
                },
              })),
            );
          });
        }
      }

      if (props.whitelistIp) {
        this.whitelistIpSet = new CfnIPSet(this, "WhitelistIpSet", {
          addresses: [...props.whitelistIp],
          ipAddressVersion: "IPV4",
          scope: props.scope,
        });
        rules.push({
          name: "RuleWithWhitelistIpSet",
          priority: 1,
          action: { allow: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: "WhitelistIpSetMetric",
          },
          statement: {
            ipSetReferenceStatement: {
              arn: this.whitelistIpSet.attrArn,
            },
          },
        });
      }

      if (props.whitelistIpv6Ip) {
        this.whitelistIpv6IpSet = new CfnIPSet(this, "WhitelistIpv6IpSet", {
          addresses: [...props.whitelistIpv6Ip],
          ipAddressVersion: "IPV6",
          scope: props.scope,
        });
        rules.push({
          name: "RuleWithWhitelistIpv6IpSet",
          priority: 2,
          action: { allow: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: "WhitelistIpv6IpSetMetric",
          },
          statement: {
            ipSetReferenceStatement: {
              arn: this.whitelistIpv6IpSet.attrArn,
            },
          },
        });
      }

      if (props.blacklistIp) {
        this.blacklistIpSet = new CfnIPSet(this, "BlacklistIpSet", {
          addresses: [...props.blacklistIp],
          ipAddressVersion: "IPV4",
          scope: props.scope,
        });
        rules.push({
          name: "RuleWithBlacklistIpSet",
          priority: 3,
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: "BlacklistIpSetMetric",
          },
          statement: {
            ipSetReferenceStatement: {
              arn: this.blacklistIpSet.attrArn,
            },
          },
        });
      }

      if (props.blacklistIpv6Ip) {
        this.blacklistIpv6IpSet = new CfnIPSet(this, "BlacklistIpv6IpSet", {
          addresses: [...props.blacklistIpv6Ip],
          ipAddressVersion: "IPV6",
          scope: props.scope,
        });
        rules.push({
          name: "RuleWithBlacklistIpv6IpSet",
          priority: 4,
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: "BlacklistIpv6IpSetMetric",
          },
          statement: {
            ipSetReferenceStatement: {
              arn: this.blacklistIpv6IpSet.attrArn,
            },
          },
        });
      }

      this.webAcl = new CfnWebACL(this, "WebAcl", {
        defaultAction: { allow: {} },
        scope: props.scope,
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: `WebAclMetric`,
        },
        rules: [...rules],
      });
    }
  }
}
