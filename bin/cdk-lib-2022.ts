#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";
import { DevelopmentStack } from "../lib/stacks/development";

const app = new cdk.App();

const env: cdk.Environment = { region: "", account: "" };

new DevelopmentStack(app, "CdkLibDev", { env });
