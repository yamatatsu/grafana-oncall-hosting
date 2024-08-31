import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as memorydb from "aws-cdk-lib/aws-memorydb";
import { Construct } from "constructs";

interface Props {
	vpc: ec2.IVpc;
}
/**
 * - MemoryDB
 */
export class MemoryDB extends Construct {
	public readonly redisUri: string;
	private readonly securityGroup: ec2.ISecurityGroup;

	constructor(scope: Construct, id: string, props: Props) {
		super(scope, id);

		const { vpc } = props;

		const subnetGroup = new memorydb.CfnSubnetGroup(this, "SubnetGroup", {
			subnetGroupName: "memorydb-subnet-group",
			subnetIds: vpc.privateSubnets.map((subnet) => subnet.subnetId),
			description: "MemoryDB Subnet Group",
		});
		const securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
			securityGroupName: "memorydb-security-group",
			description: "MemoryDB Security Group",
			vpc,
		});

		const cluster = new memorydb.CfnCluster(this, "Cluster", {
			clusterName: "grafana-oncall",
			nodeType: "db.t4g.small",
			numShards: 1,
			numReplicasPerShard: 1,
			engineVersion: "7.1",
			tlsEnabled: true,
			aclName: "open-access",
			autoMinorVersionUpgrade: true,
			subnetGroupName: subnetGroup.subnetGroupName,
			securityGroupIds: [securityGroup.securityGroupId],
		});
		cluster.addDependency(subnetGroup);

		this.redisUri = `redis://${cluster.attrClusterEndpointAddress}:6379`;
		this.securityGroup = securityGroup;
	}

	allowFrom(other: ec2.IConnectable) {
		other.connections.allowTo(this.securityGroup, ec2.Port.tcp(6379));
	}
}
