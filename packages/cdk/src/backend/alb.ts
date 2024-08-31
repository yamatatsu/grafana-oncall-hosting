import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elb from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";

interface Props {
	vpc: ec2.IVpc;
}

/**
 * - Alb
 */
export class Alb extends Construct {
	public readonly listener: elb.IApplicationListener;
	// TODO: It might not be needed if you use custom domain for ALB
	public readonly dnsName: string;

	constructor(scope: Construct, id: string, props: Props) {
		super(scope, id);

		const { vpc } = props;

		const alb = new elb.ApplicationLoadBalancer(this, "ALB", {
			vpc,
			vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
			internetFacing: true,
		});
		const listener = alb.addListener("Listener", {
			port: 80,
			open: true,
			protocol: elb.ApplicationProtocol.HTTP,
		});

		this.listener = listener;
		this.dnsName = alb.loadBalancerDnsName;
	}
}
