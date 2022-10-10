clean:
	rm -rf **/*.js **/*.d.ts node_modules **/node_modules cdk.out/

cdk-init:
	npm install

cdk-build:
	npm run build

cdk-upgrade:
	npm upgrade @aws-cdk --latest
	npm install

init: cdk-init