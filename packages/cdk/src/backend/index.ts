import * as cdk from "aws-cdk-lib";
import type { Construct } from "constructs";
import { Alb } from "./alb";
import { Aurora } from "./aurora";
import { FargateCluster } from "./fargate-cluster";
import { GrafanaService } from "./grafana-service";
import { MemoryDB } from "./memorydb";
import { OncallService } from "./oncall-service";
import { Vpc } from "./vpc";

type Props = cdk.StackProps & {};
export class BackendStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props: Props) {
		super(scope, id, props);

		/**
		 * Manually set this flag true after creating database and user in aurora.
		 */
		const isGrafanaDatabaseCreated = !!this.node.tryGetContext(
			"isGrafanaDatabaseCreated",
		);

		const vpc = new Vpc(this, "Vpc");

		const alb = new Alb(this, "ALB", {
			vpc: vpc.vpc,
		});

		const aurora = new Aurora(this, "Aurora", {
			vpc: vpc.vpc,
		});
		vpc.allowOutboundFrom(aurora.bastion);

		const memorydb = new MemoryDB(this, "MemoryDB", {
			vpc: vpc.vpc,
		});

		const fargateCluster = new FargateCluster(this, "FargateCluster", {
			vpc: vpc.vpc,
		});

		/**
		 * Add this context `isGrafanaDatabaseCreated` after create database and user in aurora with below commands:
		 *
		 * > CREATE DATABASE oncall CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
		 * > CREATE USER 'oncall-admin'@'%' IDENTIFIED BY '<<password>>';
		 * > GRANT all ON oncall.* TO 'oncall-admin'@'%';
		 * >
		 * > CREATE DATABASE grafana CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
		 * > CREATE USER 'grafana-admin'@'%' IDENTIFIED BY '<<password>>';
		 * > GRANT all ON grafana.* TO 'grafana-admin'@'%';
		 */
		if (!isGrafanaDatabaseCreated) {
			return;
		}

		const grafanaRootUrl = `http://${alb.dnsName}/grafana`;
		const oncallRootUrl = `http://${alb.dnsName}/oncall`;

		const grafanaService = new GrafanaService(this, "GrafanaService", {
			cluster: fargateCluster.cluster,
			grafanaDBSecret: aurora.grafanaDBSecret,
			rootUrl: grafanaRootUrl,
		});
		vpc.allowOutboundFrom(grafanaService.service);
		aurora.allowAccessDBFrom(grafanaService.service);

		const oncallService = new OncallService(this, "OncallService", {
			cluster: fargateCluster.cluster,
			oncallDBSecret: aurora.oncallDBSecret,
			rootUrl: oncallRootUrl,
			// TODO: not use internet
			grafanaApiUrl: grafanaRootUrl,
			redisUri: memorydb.redisUri,
		});
		vpc.allowOutboundFrom(oncallService.service);
		aurora.allowAccessDBFrom(oncallService.service);
		memorydb.allowFrom(oncallService.service);

		alb.listener.addTargetGroups("GrafanaTargetGroup", {
			targetGroups: [grafanaService.targetGroup],
			// conditions: [elb.ListenerCondition.pathPatterns(["/grafana/*"])],
			// priority: 1,
		});
	}
}
