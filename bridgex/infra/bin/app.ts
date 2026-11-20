import { App, Tags } from 'aws-cdk-lib';
import { BridgeXStack } from '../lib/bridgex-stack';

const app = new App();

new BridgeXStack(app, 'BridgeXStack', {
  env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
  description: 'BridgeX - legacy SOAP/XML to modern REST/JSON integration gateway (hackathon demo, AI-DLC intent 261120-bridgex-mvp)',
});

Tags.of(app).add('project', 'bridgex');
Tags.of(app).add('aidlc-intent', '261120-bridgex-mvp');
