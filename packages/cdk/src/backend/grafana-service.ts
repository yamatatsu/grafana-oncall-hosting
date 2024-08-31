import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elb from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

interface Props {
	cluster: ecs.ICluster;
	grafanaDBSecret: secretsmanager.ISecret;
	rootUrl: string;
}
/**
 * - Fargate for Grafana
 */
export class GrafanaService extends Construct {
	public readonly service: ecs.BaseService;
	public readonly targetGroup: elb.IApplicationTargetGroup;

	constructor(scope: Construct, id: string, props: Props) {
		super(scope, id);

		const { cluster, grafanaDBSecret, rootUrl } = props;

		// Grafana Admin Password
		const grafanaAdminPassword = new secretsmanager.Secret(
			this,
			"grafanaAdminPassword",
		);

		const taskDef = new ecs.FargateTaskDefinition(this, "TaskDefinition", {
			cpu: 256,
			memoryLimitMiB: 512,
			runtimePlatform: {
				cpuArchitecture: ecs.CpuArchitecture.ARM64,
			},
		});

		taskDef.addContainer("Grafana", {
			image: ecs.ContainerImage.fromRegistry("grafana/grafana:11.1.4"),
			portMappings: [{ containerPort: 3000 }],
			logging: ecs.LogDriver.awsLogs({
				streamPrefix: "Grafana",
				logRetention: logs.RetentionDays.THREE_MONTHS,
			}),
			secrets: {
				GF_SECURITY_ADMIN_PASSWORD:
					ecs.Secret.fromSecretsManager(grafanaAdminPassword),
				GF_DATABASE_HOST: ecs.Secret.fromSecretsManager(
					grafanaDBSecret,
					"host",
				),
				GF_DATABASE_NAME: ecs.Secret.fromSecretsManager(
					grafanaDBSecret,
					"dbname",
				),
				GF_DATABASE_USER: ecs.Secret.fromSecretsManager(
					grafanaDBSecret,
					"username",
				),
				GF_DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(
					grafanaDBSecret,
					"password",
				),
			},
			environment: {
				GF_SERVER_ROOT_URL: rootUrl,
				GF_SERVER_SERVE_FROM_SUB_PATH: "true",
				GF_DATABASE_TYPE: "mysql",
				GF_SECURITY_ADMIN_USER: "admin",

				// Settings for pre-install OnCall Plugin
				GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS: "grafana-oncall-app",
				GF_INSTALL_PLUGINS: "grafana-oncall-app vv1.8.13",
			},
			// Grafana needs to write to some files.
			readonlyRootFilesystem: false,
		});

		const fargateService = new ecs.FargateService(this, "FargateService", {
			cluster,
			vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
			taskDefinition: taskDef,
			desiredCount: 1,
			maxHealthyPercent: 200,
			minHealthyPercent: 50,
			// enableExecuteCommand: true,
			circuitBreaker: {
				enable: true,
				rollback: false,
			},
		});

		const targetGroup = new elb.ApplicationTargetGroup(
			this,
			"GrafanaTargetGroup",
			{
				vpc: cluster.vpc,
				targets: [fargateService],
				protocol: elb.ApplicationProtocol.HTTP,
				port: 3000,
				healthCheck: { path: "/api/health" },
			},
		);

		this.service = fargateService;
		this.targetGroup = targetGroup;
	}
}
