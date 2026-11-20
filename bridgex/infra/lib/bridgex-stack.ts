import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, type CfnStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { CachePolicy, Distribution, PriceClass, ResponseHeadersPolicy, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { ComparisonOperator, Dashboard, GraphWidget, MathExpression, Metric, SingleValueWidget, TextWidget, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { AttributeType, Billing, TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, type NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import { join } from 'node:path';
import { INTEGRATION_DOCUMENTS } from '../../src/config/integrations';
import { METRICS_NAMESPACE } from '../../src/gateway/metrics';

const ROOT = join(import.meta.dirname, '..', '..');
const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const FOUNDATION_MODEL = MODEL_ID.replace(/^us\./, '');
const INFERENCE_PROFILE_REGIONS = ['us-east-1', 'us-east-2', 'us-west-2'];
const INTEGRATION_IDS = INTEGRATION_DOCUMENTS.map((doc) => (doc as { id: string }).id);

/** Everything BridgeX needs in one stack (U4, ADR-001/005/007/009/010). Demo data only, so everything is removable. */
export class BridgeXStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // ---- Data and secrets -------------------------------------------------
    const table = new TableV2(this, 'Table', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billing: Billing.onDemand(),
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const clientApiKey = new Secret(this, 'ClientApiKey', {
      description: 'BridgeX client API key (x-api-key)',
      generateSecretString: { excludePunctuation: true, passwordLength: 40 },
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const coreBankingCredentials = new Secret(this, 'CoreBankingCredentials', {
      description: 'WS-Security UsernameToken that BridgeX presents to the (simulated) core banking system',
      generateSecretString: { secretStringTemplate: JSON.stringify({ username: 'bridgex-svc' }), generateStringKey: 'password', excludePunctuation: true, passwordLength: 32 },
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const fintechToken = new Secret(this, 'FintechToken', {
      description: 'Bearer token that BridgeX presents to the (simulated) FinTech API',
      generateSecretString: { excludePunctuation: true, passwordLength: 48 },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // ---- Functions -----------------------------------------------------------
    const common: NodejsFunctionProps = {
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      projectRoot: ROOT,
      depsLockFilePath: join(ROOT, 'package-lock.json'),
      bundling: { minify: true, sourceMap: true, target: 'node22', bundleAwsSDK: true },
      environment: { NODE_OPTIONS: '--enable-source-maps', TABLE_NAME: table.tableName },
    };

    const simulatorsFn = new NodejsFunction(this, 'SimulatorsFunction', {
      ...common,
      description: 'BridgeX simulated legacy core banking (SOAP) and FinTech (REST)',
      entry: join(ROOT, 'src/simulators/lambda.ts'),
      memorySize: 256,
      timeout: Duration.seconds(10),
      logGroup: new LogGroup(this, 'SimulatorsLogs', { retention: RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.DESTROY }),
      environment: {
        ...common.environment,
        CORE_BANKING_SECRET_ARN: coreBankingCredentials.secretArn,
        FINTECH_SECRET_ARN: fintechToken.secretArn,
      },
    });
    table.grantReadWriteData(simulatorsFn);
    coreBankingCredentials.grantRead(simulatorsFn);
    fintechToken.grantRead(simulatorsFn);

    const simulatorsApi = new HttpApi(this, 'SimulatorsApi', {
      apiName: 'bridgex-simulated-systems',
      description: 'Stand-ins for the legacy core banking system and the FinTech API',
      defaultIntegration: new HttpLambdaIntegration('SimulatorsIntegration', simulatorsFn),
    });

    const gatewayFn = new NodejsFunction(this, 'GatewayFunction', {
      ...common,
      description: 'BridgeX gateway: auth, validation, SOAP/REST transformation, retries, request log',
      entry: join(ROOT, 'src/gateway/lambda.ts'),
      memorySize: 512,
      timeout: Duration.seconds(25),
      logGroup: new LogGroup(this, 'GatewayLogs', { retention: RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.DESTROY }),
      environment: {
        ...common.environment,
        API_KEY_SECRET_ARN: clientApiKey.secretArn,
        CORE_BANKING_SECRET_ARN: coreBankingCredentials.secretArn,
        FINTECH_SECRET_ARN: fintechToken.secretArn,
        CORE_BANKING_URL: `${simulatorsApi.apiEndpoint}/core-banking`,
        FINTECH_URL: `${simulatorsApi.apiEndpoint}/fintech`,
        BEDROCK_MODEL_ID: MODEL_ID,
      },
    });
    table.grantReadWriteData(gatewayFn);
    clientApiKey.grantRead(gatewayFn);
    coreBankingCredentials.grantRead(gatewayFn);
    fintechToken.grantRead(gatewayFn);
    gatewayFn.addToRolePolicy(
      new PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${MODEL_ID}`,
          // The US cross-region inference profile routes to these three regions
          // (`aws bedrock get-inference-profile`, checked 2026-11-20; review finding W4). No wildcard.
          ...INFERENCE_PROFILE_REGIONS.map((region) => `arn:aws:bedrock:${region}::foundation-model/${FOUNDATION_MODEL}`),
        ],
      }),
    );

    // ---- Dashboard hosting -----------------------------------------------------
    const dashboardBucket = new Bucket(this, 'DashboardBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    const distribution = new Distribution(this, 'DashboardDistribution', {
      comment: 'BridgeX dashboard',
      defaultRootObject: 'index.html',
      priceClass: PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(dashboardBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
      },
    });

    // ---- Gateway API -------------------------------------------------------------
    const gatewayApi = new HttpApi(this, 'GatewayApi', {
      apiName: 'bridgex-gateway',
      description: 'BridgeX client-facing API (REST/JSON and SOAP/XML) and admin API',
      defaultIntegration: new HttpLambdaIntegration('GatewayIntegration', gatewayFn),
      corsPreflight: {
        allowOrigins: [`https://${distribution.distributionDomainName}`, 'http://localhost:3000'],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.OPTIONS],
        allowHeaders: ['content-type', 'x-api-key', 'idempotency-key', 'soapaction'],
        exposeHeaders: ['x-bridgex-request-id', 'x-bridgex-attempts', 'x-bridgex-latency-ms', 'x-idempotent-replay'],
        maxAge: Duration.hours(1),
      },
    });
    const stage = gatewayApi.defaultStage?.node.defaultChild as CfnStage | undefined;
    if (stage) stage.defaultRouteSettings = { throttlingRateLimit: 20, throttlingBurstLimit: 50 };

    new BucketDeployment(this, 'DeployDashboard', {
      sources: [Source.asset(join(ROOT, 'dashboard')), Source.jsonData('config.json', { apiUrl: gatewayApi.apiEndpoint, environment: 'aws' })],
      destinationBucket: dashboardBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // ---- Observability (AI-DLC stage 4.4) -------------------------------------------
    const metric = (name: string, integration: string, statistic: string) =>
      new Metric({ namespace: METRICS_NAMESPACE, metricName: name, dimensionsMap: { Integration: integration }, statistic, period: Duration.minutes(1), label: integration });
    const perIntegration = (name: string, statistic: string) => INTEGRATION_IDS.map((integration) => metric(name, integration, statistic));

    const failuresTotal = new MathExpression({
      expression: INTEGRATION_IDS.map((_, i) => `FILL(m${i}, 0)`).join(' + '),
      usingMetrics: Object.fromEntries(INTEGRATION_IDS.map((integration, i) => [`m${i}`, metric('Failures', integration, 'Sum').with({ period: Duration.minutes(5) })])),
      period: Duration.minutes(5),
      label: 'Downstream failures (5xx)',
    });
    const alarm = failuresTotal.createAlarm(this, 'DownstreamFailuresAlarm', {
      alarmDescription: 'BridgeX returned more than 5 server-side failures in 5 minutes',
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    const opsDashboard = new Dashboard(this, 'OperationsDashboard', {
      dashboardName: 'BridgeX-Operations',
      widgets: [
        [new TextWidget({ markdown: '## BridgeX operations\nRequests, failures, retries and latency per integration (Embedded Metric Format from the gateway).', width: 24, height: 2 })],
        [
          new GraphWidget({ title: 'Requests per minute', left: perIntegration('Requests', 'Sum'), width: 8 }),
          new GraphWidget({ title: 'Failures (5xx)', left: perIntegration('Failures', 'Sum'), width: 8 }),
          new GraphWidget({ title: 'Retries', left: perIntegration('Retries', 'Sum'), width: 8 }),
        ],
        [
          new GraphWidget({ title: 'Latency p95 (ms)', left: perIntegration('LatencyMs', 'p95'), width: 12 }),
          new GraphWidget({ title: 'Downstream latency p95 (ms)', left: perIntegration('DownstreamLatencyMs', 'p95'), width: 12 }),
        ],
        [
          new GraphWidget({ title: 'Lambda errors', left: [gatewayFn.metricErrors(), simulatorsFn.metricErrors()], width: 8 }),
          new GraphWidget({ title: 'Lambda duration p95', left: [gatewayFn.metricDuration({ statistic: 'p95' }), simulatorsFn.metricDuration({ statistic: 'p95' })], width: 8 }),
          new SingleValueWidget({ title: 'Failures, last 5 minutes', metrics: [failuresTotal], width: 8 }),
        ],
      ],
    });

    // ---- Outputs -----------------------------------------------------------------------
    new CfnOutput(this, 'DashboardUrl', { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, 'GatewayUrl', { value: gatewayApi.apiEndpoint });
    new CfnOutput(this, 'SimulatorsUrl', { value: simulatorsApi.apiEndpoint });
    new CfnOutput(this, 'ApiKeySecretArn', { value: clientApiKey.secretArn, description: 'Read with scripts/show-api-key.sh' });
    new CfnOutput(this, 'CloudWatchDashboard', { value: opsDashboard.dashboardName });
    new CfnOutput(this, 'FailureAlarm', { value: alarm.alarmName });
  }
}
