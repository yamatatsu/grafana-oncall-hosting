import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

interface Props {
	cluster: ecs.ICluster;
}
/**
 * - Fargate for Grafana PDC Agent
 *
 * @see https://grafana.com/docs/grafana-cloud/connect-externally-hosted/private-data-source-connect/
 *
 * You can use new user restricted to SELECT specific table.
 * > CREATE USER 'grafana-cloud'@'%' IDENTIFIED BY '<<random password you'll set>>';
 * > GRANT SELECT ON mydb.PlcData TO 'grafana-cloud'@'%';
 */
export class GrafanaPdcAgent extends Construct {
	public readonly service: ecs.BaseService;

	constructor(scope: Construct, id: string, props: Props) {
		super(scope, id);

		const { cluster } = props;

		const taskDef = new ecs.FargateTaskDefinition(this, "TaskDefinition", {
			cpu: 256,
			memoryLimitMiB: 512,
			runtimePlatform: {
				cpuArchitecture: ecs.CpuArchitecture.ARM64,
			},
		});

		// Need to create the following SSM Parameters manually.
		// You can get these values from Grafana Cloud.
		// @see https://grafana.com/docs/grafana-cloud/connect-externally-hosted/private-data-source-connect/configure-pdc/#pdc-connection-steps
		const pdcAgentToken = ssm.StringParameter.fromStringParameterName(
			this,
			"PdcAgentToken",
			"/grafana-oncall-hosting/pdc-agent-token",
		).stringValue;
		const pdcAgentCluster = ssm.StringParameter.fromStringParameterName(
			this,
			"PdcAgentCluster",
			"/grafana-oncall-hosting/pdc-agent-cluster",
		).stringValue;
		const gcloudHostedGrafanaId = ssm.StringParameter.fromStringParameterName(
			this,
			"GcloudHostedGrafanaId",
			"/grafana-oncall-hosting/gcloud-hosted-grafana-id",
		).stringValue;

		taskDef.addContainer("PdcAgent", {
			image: ecs.ContainerImage.fromRegistry("grafana/pdc-agent:0.0.32"),
			command: [
				"-token",
				pdcAgentToken,
				"-cluster",
				pdcAgentCluster,
				"-gcloud-hosted-grafana-id",
				gcloudHostedGrafanaId,
			],
			logging: ecs.LogDriver.awsLogs({
				streamPrefix: "PdcAgent",
				logRetention: logs.RetentionDays.THREE_MONTHS,
			}),
			// PDC Agent needs to write to the filesystem.
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

		this.service = fargateService;
	}
}
