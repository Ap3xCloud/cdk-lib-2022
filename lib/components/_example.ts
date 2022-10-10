import * as cdk from "@aws-cdk/core";
import { BaseConstructProps } from "../utils";

interface ConstructProps extends BaseConstructProps {}

export class _Example extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: ConstructProps) {
    super(scope, id);
  }
}
