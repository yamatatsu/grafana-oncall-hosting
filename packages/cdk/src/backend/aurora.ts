import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

interface Props {
	vpc: ec2.IVpc;
}
/**
 * - Aurora
 * - Bastion
 */
export class Aurora extends Construct {
	public readonly dbRootSecret: secretsmanager.ISecret;
	public readonly oncallDBSecret: secretsmanager.ISecret;
	public readonly grafanaDBSecret: secretsmanager.ISecret;
	public readonly bastion: ec2.IInstance;

	private readonly auroraCluster: rds.IDatabaseCluster;

	constructor(scope: Construct, id: string, props: Props) {
		super(scope, id);

		const { vpc } = props;

		const auroraCluster = new rds.DatabaseCluster(this, "Aurora", {
			vpc,
			vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
			engine: rds.DatabaseClusterEngine.auroraMysql({
				version: rds.AuroraMysqlEngineVersion.VER_3_06_0,
			}),
			credentials: rds.Credentials.fromGeneratedSecret("admin"),
			defaultDatabaseName: "mydb",
			writer: rds.ClusterInstance.provisioned("writer", {
				publiclyAccessible: false,
			}),
			parameterGroup: new rds.ParameterGroup(
				this,
				`${id}-aurora-parameters-group`,
				{
					engine: rds.DatabaseClusterEngine.auroraMysql({
						version: rds.AuroraMysqlEngineVersion.VER_3_06_0,
					}),
					parameters: {
						character_set_server: "utf8mb4",
						character_set_client: "utf8mb4",
						server_audit_logging: "1", // 監査ログ
						server_audit_events: "CONNECT,QUERY,TABLE", // 出力する監査ログの種類
					},
				},
			),
			preferredMaintenanceWindow: "Sat:17:00-Sat:17:30",
			removalPolicy: cdk.RemovalPolicy.DESTROY,
		});

		const grafanaDBSecret = new secretsmanager.Secret(this, "GrafanaDBSecret", {
			generateSecretString: {
				excludePunctuation: true,
				generateStringKey: "password",
				secretStringTemplate: JSON.stringify({
					host: auroraCluster.clusterEndpoint.hostname,
					dbname: "grafana",
					username: "grafana-admin",
				}),
			},
		});

		const oncallDBSecret = new secretsmanager.Secret(this, "OncallDBSecret", {
			generateSecretString: {
				excludePunctuation: true,
				generateStringKey: "password",
				secretStringTemplate: JSON.stringify({
					host: auroraCluster.clusterEndpoint.hostname,
					dbname: "oncall",
					username: "oncall-admin",
				}),
			},
		});

		const bastion = new ec2.BastionHostLinux(this, "BastionHost", {
			vpc,
			subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
		});

		// biome-ignore lint/style/noNonNullAssertion: CDKでは`!`を使うことを厭わない
		this.dbRootSecret = auroraCluster.secret!;
		this.oncallDBSecret = oncallDBSecret;
		this.grafanaDBSecret = grafanaDBSecret;
		this.bastion = bastion;
		this.auroraCluster = auroraCluster;

		this.allowAccessDBFrom(bastion);
	}

	allowAccessDBFrom(other: ec2.IConnectable) {
		this.auroraCluster.connections.allowFrom(other, ec2.Port.tcp(3306));
	}
}
