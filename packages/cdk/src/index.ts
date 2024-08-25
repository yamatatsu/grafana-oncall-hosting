import * as cdk from "aws-cdk-lib";
import { BackendStack } from "./backend";

const prefix = "GrafanaSelfHosting";

const app = new cdk.App();

new BackendStack(app, `${prefix}Backend`, {});
