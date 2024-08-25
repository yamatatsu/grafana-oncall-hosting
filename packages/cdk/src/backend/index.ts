import * as cdk from "aws-cdk-lib";
import type { Construct } from "constructs";
import { Vpc } from "./vpc";

type Props = cdk.StackProps & {};
export class BackendStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props: Props) {
		super(scope, id, props);

		new Vpc(this, "Vpc");
	}
}
