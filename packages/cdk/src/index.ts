import * as cdk from "aws-cdk-lib";
import { BackendStack } from "./backend";
import { STACK_ENV } from "./constants";

const prefix = "GrafanaSelfHosting";

const app = new cdk.App();

new BackendStack(app, `${prefix}Backend`, { env: STACK_ENV });
