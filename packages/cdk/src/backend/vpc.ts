import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

/**
 * - VPC
 * - Subnet
 * - NAT
 * - S3 Gateway Endpoint
 */
export class Vpc extends Construct {
	public readonly vpc: ec2.IVpc;

	private readonly natConnections: ec2.Connections;

	constructor(scope: Construct, id: string) {
		super(scope, id);

		const natProvider = ec2.NatProvider.instanceV2({
			instanceType: ec2.InstanceType.of(
				ec2.InstanceClass.T4G,
				ec2.InstanceSize.NANO,
			),
			machineImage: ec2.MachineImage.latestAmazonLinux2023({
				cpuType: ec2.AmazonLinuxCpuType.ARM_64,
			}),
			defaultAllowedTraffic: ec2.NatTrafficDirection.OUTBOUND_ONLY,
		});

		const vpc = new ec2.Vpc(this, "Vpc", {
			natGatewayProvider: natProvider,
			subnetConfiguration: [
				{
					cidrMask: 24,
					name: "Public",
					subnetType: ec2.SubnetType.PUBLIC,
				},
				{
					cidrMask: 24,
					name: "Private",
					subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
				},
				{
					cidrMask: 24,
					name: "Isolated",
					subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
				},
			],
		});
		vpc.addGatewayEndpoint(`${id}-S3EndpointForPrivate`, {
			service: ec2.GatewayVpcEndpointAwsService.S3,
			subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
		});

		this.vpc = vpc;
		this.natConnections = natProvider.connections;
	}

	allowOutboundFrom(other: ec2.IConnectable) {
		this.natConnections.allowFrom(other, ec2.Port.allTraffic());
	}
}
