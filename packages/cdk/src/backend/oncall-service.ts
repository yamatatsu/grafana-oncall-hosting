import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elb from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

interface Props {
	cluster: ecs.ICluster;
	oncallDBSecret: secretsmanager.ISecret;
	rootUrl: string;
	grafanaApiUrl: string;
	redisUri: string;
}
/**
 * - Fargate for Grafana OnCall
 */
export class OncallService extends Construct {
	public readonly service: ecs.BaseService;
	public readonly targetGroup: elb.IApplicationTargetGroup;

	constructor(scope: Construct, id: string, props: Props) {
		super(scope, id);

		const { cluster, oncallDBSecret, rootUrl, grafanaApiUrl, redisUri } = props;

		const secretKey = new secretsmanager.Secret(this, "SecretKey");

		const taskDef = new ecs.FargateTaskDefinition(this, "TaskDefinition", {
			cpu: 1024, // https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html
			memoryLimitMiB: 2048, // https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html
			runtimePlatform: {
				cpuArchitecture: ecs.CpuArchitecture.ARM64,
			},
		});

		const secrets = {
			SECRET_KEY: ecs.Secret.fromSecretsManager(secretKey),
			MYSQL_HOST: ecs.Secret.fromSecretsManager(oncallDBSecret, "host"),
			MYSQL_DB_NAME: ecs.Secret.fromSecretsManager(oncallDBSecret, "dbname"),
			MYSQL_USER: ecs.Secret.fromSecretsManager(oncallDBSecret, "username"),
			MYSQL_PASSWORD: ecs.Secret.fromSecretsManager(oncallDBSecret, "password"),
		} satisfies ecs.ContainerDefinitionOptions["secrets"];

		const environment = {
			DATABASE_TYPE: "mysql",
			BROKER_TYPE: "redis",
			BASE_URL: rootUrl,
			REDIS_URI: redisUri,
			// This setting `settings.helm` is useful for hosting on fargate as well.
			// `settings.prod_without_db` includes `SECURE_SSL_REDIRECT = True`, so it needs to use custom domain with SSL.
			DJANGO_SETTINGS_MODULE: "settings.helm",
			CELERY_WORKER_QUEUE:
				"default,critical,long,slack,telegram,webhook,retry,celery,grafana",
			CELERY_WORKER_CONCURRENCY: "1",
			CELERY_WORKER_MAX_TASKS_PER_CHILD: "100",
			CELERY_WORKER_SHUTDOWN_INTERVAL: "65m",
			CELERY_WORKER_BEAT_ENABLED: "True",
			GRAFANA_API_URL: grafanaApiUrl,
			MYSQL_PORT: "",
		} satisfies ecs.ContainerDefinitionOptions["environment"];

		const engine = taskDef.addContainer("Engine", {
			image: ecs.ContainerImage.fromRegistry("grafana/oncall:v1.8.13"),
			command: ["uwsgi", "--ini", "uwsgi.ini"],
			portMappings: [{ containerPort: 8080 }],
			logging: ecs.LogDriver.awsLogs({
				streamPrefix: "Engine",
				logRetention: logs.RetentionDays.THREE_MONTHS,
			}),
			secrets,
			environment,
			// This image needs to create `tmp` directory.
			readonlyRootFilesystem: false,
		});

		const celery = taskDef.addContainer("Celery", {
			image: ecs.ContainerImage.fromRegistry("grafana/oncall:v1.8.13"),
			command: ["sh", "-c", '"./celery_with_exporter.sh"'],
			logging: ecs.LogDriver.awsLogs({
				streamPrefix: "Celery",
				logRetention: logs.RetentionDays.THREE_MONTHS,
			}),
			secrets,
			environment,
			// This image needs to create `tmp` directory.
			readonlyRootFilesystem: false,
		});

		const dbMigration = taskDef.addContainer("DBMigration", {
			image: ecs.ContainerImage.fromRegistry("grafana/oncall:v1.8.13"),
			command: ["python", "manage.py", "migrate", "--noinput"],
			logging: ecs.LogDriver.awsLogs({
				streamPrefix: "DBMigration",
				logRetention: logs.RetentionDays.THREE_MONTHS,
			}),
			secrets,
			environment,
			essential: false,
			readonlyRootFilesystem: true,
		});

		engine.addContainerDependencies({
			container: dbMigration,
			condition: ecs.ContainerDependencyCondition.SUCCESS,
		});
		celery.addContainerDependencies({
			container: dbMigration,
			condition: ecs.ContainerDependencyCondition.SUCCESS,
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
				port: 8080,
				healthCheck: { path: "/health/", healthyHttpCodes: "200" },
			},
		);

		this.service = fargateService;
		this.targetGroup = targetGroup;
	}
}
