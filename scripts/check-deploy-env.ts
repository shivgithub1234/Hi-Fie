import nextEnv from '@next/env';
import { deploymentIssues } from '../lib/deployment-env';
nextEnv.loadEnvConfig(process.cwd(), false);

const issues = deploymentIssues(process.env);
if (issues.length) {
  console.error('Production environment is incomplete:');
  for (const issue of issues) console.error(`- ${issue}`);
  console.error('Set these values in the hosting dashboard. No credential values have been printed.');
  process.exitCode = 1;
} else console.log('Production environment checks passed.');
