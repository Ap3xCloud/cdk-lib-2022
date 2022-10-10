import { IRole } from "@aws-cdk/aws-iam";
import { Environment } from "@aws-cdk/core";

export interface BaseConstructProps {
  keyname: string;
  teamrole: IRole;
  instanceProfile: {
    arn: string;
    name: string;
  };
}

export interface IEndpoint {
  hostname: string;
  port: string;
}

export interface IRdsCredential {
  username: string;
  password: string;
  databaseName: string;
  tableName?: string;
}

export interface IEfsConfig {
  fileSystemId: string;
  accessPointId: string;
}

export interface IRdsConfig {
  address: string;
  port: string;
  credential: IRdsCredential;
}

export interface IDocumentDbCredential {
  username: string;
  password: string;
  databaseName: string;
  collectionName: string;
}

export interface IDocumentDbConfig {
  address: string;
  port: string;
  credential: IDocumentDbCredential;
  tlsEnable: boolean;
}

export interface IElastiCacheConfig {
  address: string;
  port: string;
}
