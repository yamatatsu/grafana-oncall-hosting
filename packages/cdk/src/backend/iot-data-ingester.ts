import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as logs from "aws-cdk-lib/aws-logs";
import type * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

interface Props {
	cluster: ecs.ICluster;
	dbRootSecret: secretsmanager.ISecret;
}
/**
 * - Fargate for putting data
 */
export class IotDataIngester extends Construct {
	public readonly service: ecs.BaseService;

	constructor(scope: Construct, id: string, props: Props) {
		super(scope, id);

		const { cluster, dbRootSecret } = props;

		const taskDef = new ecs.FargateTaskDefinition(this, "TaskDefinition", {
			cpu: 256,
			memoryLimitMiB: 512,
			runtimePlatform: {
				cpuArchitecture: ecs.CpuArchitecture.ARM64,
			},
		});

		const iotDataIngesterContainer = taskDef.addContainer("IotDataIngester", {
			image: ecs.ContainerImage.fromAsset("../../", {
				target: "iot-data-ingester",
				ignoreMode: cdk.IgnoreMode.DOCKER,
				exclude: ["**/node_modules", ".git", "packages/cdk"],
			}),
			logging: ecs.LogDriver.awsLogs({
				streamPrefix: "IotDataIngester",
				logRetention: logs.RetentionDays.THREE_MONTHS,
			}),
			secrets: {
				DB_HOST: ecs.Secret.fromSecretsManager(dbRootSecret, "host"),
				DB_DBNAME: ecs.Secret.fromSecretsManager(dbRootSecret, "dbname"),
				DB_USERNAME: ecs.Secret.fromSecretsManager(dbRootSecret, "username"),
				DB_PASSWORD: ecs.Secret.fromSecretsManager(dbRootSecret, "password"),
			},
			// The npm library `tsx` needs to write to the filesystem.
			readonlyRootFilesystem: false,
		});

		const dbMigrationContainer = taskDef.addContainer("DBMigration", {
			image: ecs.ContainerImage.fromAsset("../../", {
				target: "iot-data-ingester-dev",
				ignoreMode: cdk.IgnoreMode.DOCKER,
				exclude: ["**/node_modules", ".git", "packages/cdk"],
			}),
			command: ["pnpm", "prisma", "migrate", "deploy"],
			logging: ecs.LogDriver.awsLogs({
				streamPrefix: "DBMigration",
				logRetention: logs.RetentionDays.THREE_MONTHS,
			}),
			secrets: {
				DB_HOST: ecs.Secret.fromSecretsManager(dbRootSecret, "host"),
				DB_DBNAME: ecs.Secret.fromSecretsManager(dbRootSecret, "dbname"),
				DB_USERNAME: ecs.Secret.fromSecretsManager(dbRootSecret, "username"),
				DB_PASSWORD: ecs.Secret.fromSecretsManager(dbRootSecret, "password"),
			},
			essential: false,
			readonlyRootFilesystem: true,
		});

		iotDataIngesterContainer.addContainerDependencies({
			container: dbMigrationContainer,
			condition: ecs.ContainerDependencyCondition.COMPLETE,
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
