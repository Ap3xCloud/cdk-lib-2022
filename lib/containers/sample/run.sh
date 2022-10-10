#!/bin/bash
cat > /root/server.ini <<EOF
"LogLocation" = "./"
"FsPath" = "${FS_PATH}"
"PgsqlHost" = "${POSTGRES_HOST}"
"PgsqlPort" = "${POSTGRES_PORT}"
"PgsqlUser" = "${POSTGRES_USER}"
"PgsqlPass" = "${POSTGRES_PASSWORD}"
"PgsqlDb" = "${POSTGRES_DATABASE}"
"PgsqlTable" = "${POSTGRES_TABLE}"
"MysqlHost" = "${MYSQL_HOST:-localhost}"
"MysqlPort" = "${MYSQL_PORT:-3306}"
"MysqlUser" = "${MYSQL_USER}"
"MysqlPass" = "${MYSQL_PASSWORD}"
"MysqlDb" = "${MYSQL_DATABASE}"
"MongoDbHost" = "${MONGODB_HOST}"
"MongoDbPort" = "${MONGODB_PORT}"
"MongoDbUser" = "${MONGODB_USER}"
"MongoDbPass" = "${MONGODB_PASSWORD}"
"MongoDbDatabase" = "${MONGODB_DATABASE}"
"MongoDbCollection" = "${MONGODB_COLLECTION}"
"MongoDbCAFilePath" = "rds-combined-ca-bundle.pem"
"MongoDbEnableSSL" = ${MONGODB_ENABLE_SSL:-false}
"RedisHost" = "${REDIS_HOST:-localhost}"
"RedisPort" = "${REDIS_PORT:-6379}"
"MemcacheHost" = "${MEMCACHED_HOST}"
"MemcachePort" = "${MEMCACHED_PORT}"
"AwsRegion" = "${AWS_REGION}"
EOF
chmod -R ugo+rwx /root
/root/server  