import * as cdk from "aws-cdk-lib";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import type { Construct } from "constructs";
import { Alb } from "./alb";
import { Aurora } from "./aurora";
import { FargateCluster } from "./fargate-cluster";
import { GrafanaPdcAgent } from "./grafana-pdc-agent";
import { GrafanaService } from "./grafana-service";
import { IotDataIngester } from "./iot-data-ingester";
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

		const grafanaPdcAgent = new GrafanaPdcAgent(this, "GrafanaPdcAgent", {
			cluster: fargateCluster.cluster,
		});
		vpc.allowOutboundFrom(grafanaPdcAgent.service);
		aurora.allowAccessDBFrom(grafanaPdcAgent.service);

		const iotDataIngester = new IotDataIngester(this, "IotDataIngester", {
			cluster: fargateCluster.cluster,
			dbRootSecret: aurora.dbRootSecret,
		});
		vpc.allowOutboundFrom(iotDataIngester.service);
		aurora.allowAccessDBFrom(iotDataIngester.service);

		const alertTopic = new sns.Topic(this, "AlertTopic");
		alertTopic.addSubscription(
			new snsSubscriptions.UrlSubscription(
				"https://oncall-prod-us-central-0.grafana.net/oncall/integrations/v1/amazon_sns/VYAueEPpd2c0e6vZG3QJKgTID/",
			),
		);

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

		const mainAlb = new Alb(this, "MainALB", {
			vpc: vpc.vpc,
		});
		const oncallAlb = new Alb(this, "OncallALB", {
			vpc: vpc.vpc,
		});

		/**
		 * These URLs will be defined in `constants.ts` when the custom domain is used.
		 */
		const grafanaRootUrl = `http://${mainAlb.dnsName}/grafana`;
		const oncallRootUrl = `http://${oncallAlb.dnsName}`;

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

		mainAlb.listener.addTargetGroups("GrafanaTargetGroup", {
			targetGroups: [grafanaService.targetGroup],
			/**
			 * not used yet because this stack does not have the main web services.
			 */
			// conditions: [elb.ListenerCondition.pathPatterns(["/grafana/*"])],
			// priority: 1,
		});

		/**
		 * OnCall is not joined in main ALB because it is not able to handle subpath such as `/oncall/*`.
		 * @see https://github.com/grafana/oncall/issues/4302
		 */
		oncallAlb.listener.addTargetGroups("OncallTargetGroup", {
			targetGroups: [oncallService.targetGroup],
		});
	}
}
