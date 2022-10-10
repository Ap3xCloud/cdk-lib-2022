import { Fn, Construct } from "@aws-cdk/core";
import {
  CfnEgressOnlyInternetGateway,
  CfnEIP,
  CfnInstance,
  CfnInternetGateway,
  CfnNatGateway,
  CfnNetworkAcl,
  CfnNetworkAclEntry,
  CfnRoute,
  CfnRouteTable,
  CfnSecurityGroup,
  CfnSubnet,
  CfnSubnetRouteTableAssociation,
  CfnVPC,
  CfnVPCCidrBlock,
  CfnVPCGatewayAttachment,
  InstanceType,
  NatInstanceImage,
  Subnet,
  Vpc,
} from "@aws-cdk/aws-ec2";
import { BaseConstructProps } from "../utils";
import { IVpc } from "@aws-cdk/aws-ec2";

export enum NatType {
  GATEWAY,
  INSTANCE,
}

interface ISubnetsDivision<T> {
  public: T;
  private: T;
  isolated: T;
}

interface ConstructProps extends BaseConstructProps {
  availabilityZones: string[];
  cidrs: {
    vpc: string;
    subnets: ISubnetsDivision<string[]>;
  };
  nat: {
    type: NatType;
    instanceType?: InstanceType;
  };
}

type ISubnets = ISubnetsDivision<Subnet[]>;

export class CustomVpcNetwork extends Construct {
  public readonly vpc: IVpc;
  public readonly subnets: ISubnets;

  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);

    if (props.availabilityZones.length !== 3) throw new Error("AZ must be 3");
    if (props.cidrs.subnets.public.length !== 3) throw new Error("Provided public subnets CIDR must be 3 CIDRs");
    if (props.cidrs.subnets.private.length !== 3) throw new Error("Provided private subnets CIDR must be 3 CIDRs");
    if (props.cidrs.subnets.isolated.length !== 3) throw new Error("Provided isolated subnets CIDR must be 3 CIDRs");

    /* ========== VPC ========== */
    const vpc = new CfnVPC(this, "Vpc", {
      cidrBlock: props.cidrs.vpc,
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    const ipv6Cidr = new CfnVPCCidrBlock(this, "Ipv6Cidr", { vpcId: vpc.attrVpcId, amazonProvidedIpv6CidrBlock: true });

    /* ========== Internet Gateway ========== */
    const internetGateway = new CfnInternetGateway(this, "InternetGateway");
    new CfnVPCGatewayAttachment(this, "InternetGatewayAttachment", {
      vpcId: vpc.attrVpcId,
      internetGatewayId: internetGateway.attrInternetGatewayId,
    });

    /* ========== Egress Only Internet Gateway ========== */
    const egressOnlyInternetGateway = new CfnEgressOnlyInternetGateway(this, "EgressOnlyInternetGateway", { vpcId: vpc.attrVpcId });

    /* ========== Network ACL ========== */

    const networkAcl = new CfnNetworkAcl(this, "NetworkACL", { vpcId: vpc.attrVpcId });

    // new CfnSubnetNetworkAclAssociation(this, "NetworkACLAssociation", { networkAclId: networkAcl.attrId, vpcId: vpc.attrVpcId });

    new CfnNetworkAclEntry(this, "AllowAllIncomingIpv4HttpTraffic", {
      networkAclId: networkAcl.attrId,
      protocol: 6, // TCP
      ruleAction: "allow",
      ruleNumber: 100,
      egress: false, // false => Ingress | true => Egress
      cidrBlock: "0.0.0.0/0",
      portRange: {
        from: 80,
        to: 80,
      },
    });

    new CfnNetworkAclEntry(this, "AllowAllIncomingIpv6HttpTraffic", {
      networkAclId: networkAcl.attrId,
      protocol: 6, // TCP
      ruleAction: "allow",
      ruleNumber: 110,
      egress: false, // false => Ingress | true => Egress
      ipv6CidrBlock: "::/0",
      portRange: {
        from: 80,
        to: 80,
      },
    });

    new CfnNetworkAclEntry(this, "AllowAllIncomingIpv4HttpsTraffic", {
      networkAclId: networkAcl.attrId,
      protocol: 6, // TCP
      ruleAction: "allow",
      ruleNumber: 120,
      egress: false, // false => Ingress | true => Egress
      cidrBlock: "0.0.0.0/0",
      portRange: {
        from: 443,
        to: 443,
      },
    });

    // new CfnNetworkAclEntry(this, "AllowAllIncomingIpv6HttpsTraffic", {
    //   networkAclId: networkAcl.attrId,
    //   protocol: 6, // TCP
    //   ruleAction: "allow",
    //   ruleNumber: 130,
    //   egress: false, // false => Ingress | true => Egress
    //   ipv6CidrBlock: "::/0",
    //   portRange: {
    //     from: 443,
    //     to: 443,
    //   },
    // });

    new CfnNetworkAclEntry(this, "AllowAllOutgoingIpv4Traffic", {
      networkAclId: networkAcl.attrId,
      protocol: 6, // TCP
      ruleAction: "allow",
      ruleNumber: 140,
      egress: true, // false => Ingress | true => Egress
      cidrBlock: "0.0.0.0/0",
      portRange: {
        from: 1024,
        to: 65535,
      },
    });

    new CfnNetworkAclEntry(this, "AllowAllOutgoingIpv6Traffic", {
      networkAclId: networkAcl.attrId,
      protocol: 6, // TCP
      ruleAction: "allow",
      ruleNumber: 150,
      egress: true, // false => Ingress | true => Egress
      ipv6CidrBlock: "::/0",
      portRange: {
        from: 1024,
        to: 65535,
      },
    });

    /* ========== Public Subnets ========== */
    const publicSubnets: CfnSubnet[] = props.cidrs.subnets.public.map((cidr, i) => {
      const subnet = new CfnSubnet(this, `PublicSubnet${i}`, {
        assignIpv6AddressOnCreation: true,
        availabilityZone: props.availabilityZones[i],
        vpcId: vpc.attrVpcId,
        cidrBlock: cidr,
        // ipv6CidrBlock: `${ipv6Cidr.ipv6CidrBlock!.split("00::/56")[0]}a${i}::/64`,
        ipv6CidrBlock: Fn.join("", [Fn.select(0, Fn.split("00::/56", Fn.select(0, vpc.attrIpv6CidrBlocks))), `a${i}::/64`]),
        mapPublicIpOnLaunch: true,
        tags: [
          {
            key: "kubernetes.io/role/elb",
            value: "1",
          },
          {
            key: "Name",
            value: `Public Subnet ${i}`,
          },
        ],
      });
      subnet.addDependsOn(ipv6Cidr);
      return subnet;
    });

    /* ========== Private Subnets ========== */
    const privateSubnets = props.cidrs.subnets.private.map((cidr, i) => {
      const subnet = new CfnSubnet(this, `PrivateSubnet${i}`, {
        assignIpv6AddressOnCreation: true,
        availabilityZone: props.availabilityZones[i],
        vpcId: vpc.attrVpcId,
        cidrBlock: cidr,
        ipv6CidrBlock: Fn.join("", [Fn.select(0, Fn.split("00::/56", Fn.select(0, vpc.attrIpv6CidrBlocks))), `b${i}::/64`]),
        mapPublicIpOnLaunch: false,
        tags: [
          {
            key: "kubernetes.io/role/internal-elb",
            value: "1",
          },
          {
            key: "Name",
            value: `Private Subnet ${i}`,
          },
        ],
      });
      subnet.addDependsOn(ipv6Cidr);
      return subnet;
    });

    /* ========== Isolated Subnets ========== */
    const isolatedSubnets = props.cidrs.subnets.isolated.map((cidr, i) => {
      const subnet = new CfnSubnet(this, `IsolatedSubnet${i}`, {
        assignIpv6AddressOnCreation: true,
        availabilityZone: props.availabilityZones[i],
        vpcId: vpc.attrVpcId,
        cidrBlock: cidr,
        ipv6CidrBlock: Fn.join("", [Fn.select(0, Fn.split("00::/56", Fn.select(0, vpc.attrIpv6CidrBlocks))), `c${i}::/64`]),
        mapPublicIpOnLaunch: false,
        tags: [
          {
            key: "Name",
            value: `Isolated Subnet ${i}`,
          },
        ],
      });
      subnet.addDependsOn(ipv6Cidr);
      return subnet;
    });

    /* ========== Public Route Tables ========== */
    const publicRouteTables = publicSubnets.map((subnet, i) => {
      const routeTable = new CfnRouteTable(this, `PublicRouteTable${i}`, {
        vpcId: vpc.attrVpcId,
        tags: [{ key: "Name", value: `Public Route Table ${i}` }],
      });
      new CfnSubnetRouteTableAssociation(this, `PublicSubnetRouteTableAssociation${i}`, {
        routeTableId: routeTable.attrRouteTableId,
        subnetId: subnet.attrSubnetId,
      });
      new CfnRoute(this, `PublicIpv4Route${i}`, {
        routeTableId: routeTable.attrRouteTableId,
        destinationCidrBlock: "0.0.0.0/0",
        gatewayId: internetGateway.attrInternetGatewayId,
      });
      new CfnRoute(this, `PublicIpv6Route${i}`, {
        routeTableId: routeTable.attrRouteTableId,
        destinationIpv6CidrBlock: "::/0",
        gatewayId: internetGateway.attrInternetGatewayId,
      });
      return routeTable;
    });

    const natInstanceAmi = new NatInstanceImage().getImage(this);

    let natInstanceSecurityGroup: CfnSecurityGroup | undefined;

    /* ========== Private Route Tables & NAT ========== */
    const privateRouteTables = privateSubnets.map((subnet, i) => {
      const routeTable = new CfnRouteTable(this, `PrivateRouteTable${i}`, {
        vpcId: vpc.attrVpcId,
      });
      new CfnSubnetRouteTableAssociation(this, `PrivateSubnetRouteTableAssociation${i}`, {
        routeTableId: routeTable.attrRouteTableId,
        subnetId: subnet.attrSubnetId,
      });
      if (props.nat.type === NatType.GATEWAY) {
        const eip = new CfnEIP(this, `NatGatewayEIP${i}`);
        const natGateway = new CfnNatGateway(this, `NatGateway${i}`, {
          allocationId: eip.attrAllocationId,
          subnetId: subnet.attrSubnetId,
        });
        new CfnRoute(this, `PrivateIpv4Route${i}`, {
          routeTableId: routeTable.attrRouteTableId,
          destinationCidrBlock: "0.0.0.0/0",
          natGatewayId: natGateway.attrNatGatewayId,
        });
      } else if (props.nat.type === NatType.INSTANCE) {
        if (!natInstanceSecurityGroup) {
          natInstanceSecurityGroup = new CfnSecurityGroup(this, `NatInstanceSecurityGroup`, {
            groupName: `nat-instance-security-group`,
            groupDescription: `nat-instance-security-group`,
            vpcId: vpc.attrVpcId,
          });
        }
        const natInstance = new CfnInstance(this, `NatInstance${i}`, {
          imageId: natInstanceAmi.imageId,
          instanceType: props.nat.instanceType?.toString() || "t2.nano",
          monitoring: true,
          tags: [{ key: "Name", value: `NAT Instance ${i}` }],
          keyName: props.keyname,
          subnetId: publicSubnets[i].attrSubnetId,
          iamInstanceProfile: props.instanceProfile.name,
        });
        new CfnRoute(this, `PrivateIpv4Route${i}`, {
          routeTableId: routeTable.attrRouteTableId,
          destinationCidrBlock: "0.0.0.0/0",
          instanceId: natInstance.ref,
        });
      }
      new CfnRoute(this, `PrivateIpv6Route${i}`, {
        routeTableId: routeTable.attrRouteTableId,
        destinationIpv6CidrBlock: "::/0",
        egressOnlyInternetGatewayId: egressOnlyInternetGateway.attrId,
      });
      return routeTable;
    });

    /* ========== Isolated Route Tables ========== */
    const isolatedRouteTables = isolatedSubnets.map((subnet, i) => {
      const routeTable = new CfnRouteTable(this, `IsolatedRouteTable${i}`, {
        vpcId: vpc.attrVpcId,
      });
      new CfnSubnetRouteTableAssociation(this, `IsolatedSubnetRouteTableAssociation${i}`, {
        routeTableId: routeTable.attrRouteTableId,
        subnetId: subnet.attrSubnetId,
      });
      return routeTable;
    });

    this.vpc = Vpc.fromVpcAttributes(this, "ImportedVpc", {
      availabilityZones: props.availabilityZones,
      vpcId: vpc.attrVpcId,
      isolatedSubnetIds: [...this.subnets.isolated.map((s) => s.subnetId)],
      privateSubnetIds: [...this.subnets.private.map((s) => s.subnetId)],
      publicSubnetIds: [...this.subnets.public.map((s) => s.subnetId)],
    });
  }
}
