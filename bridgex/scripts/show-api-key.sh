#!/usr/bin/env bash
# Prints the BridgeX client API key from AWS Secrets Manager. Needs AWS credentials in the environment.
# The key is printed to your terminal only; do not paste it into files that get committed.
set -euo pipefail

STACK="${STACK:-BridgeXStack}"
REGION="${AWS_REGION:-us-east-1}"

ARN=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiKeySecretArn'].OutputValue" --output text)

aws secretsmanager get-secret-value --region "$REGION" --secret-id "$ARN" --query SecretString --output text
