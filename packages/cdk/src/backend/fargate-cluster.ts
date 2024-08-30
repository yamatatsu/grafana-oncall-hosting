import type * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { Construct } from "constructs";

interface Props {
	vpc: ec2.IVpc;
}
/**
 * - Fargate Cluster
 */
export class FargateCluster extends Construct {
	public readonly cluster: ecs.ICluster;

	constructor(scope: Construct, id: string, props: Props) {
		super(scope, id);

		const { vpc } = props;

		const cluster = new ecs.Cluster(this, "Cluster", {
			vpc,
			// containerInsights: true,
		});

		this.cluster = cluster;
	}
}
