import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const checkOnly = process.argv.includes('--check');
const skipMigrations = process.argv.includes('--skip-migrations');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result;
}

if (!fs.existsSync(envPath)) {
  console.error('Missing backend/.env file.');
  process.exit(1);
}

const env = parse(fs.readFileSync(envPath));
const required = ['DATABASE_URL', 'JWT_SECRET'];
const missing = required.filter((name) => !env[name]);
if (missing.length > 0) {
  console.error(
    `Missing required environment variables: ${missing.join(', ')}`,
  );
  process.exit(1);
}

run('vercel', ['--version']);
run('npm', ['run', 'build']);
run('npm', ['run', 'typecheck']);
run('npm', ['test']);

if (checkOnly) {
  console.log('Vercel deployment checks passed.');
  process.exit(0);
}

if (skipMigrations) {
  console.log('Skipping database migrations for this deployment.');
} else {
  run('npm', ['run', 'db:deploy']);
}

if (!fs.existsSync(path.join(root, '.vercel', 'project.json'))) {
  console.log('\nSelect the existing Vercel backend project when prompted.');
  run('vercel', ['link']);
}

const runtimeVariables = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'CORS_ORIGINS',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLOUDINARY_FOLDER',
];

for (const name of runtimeVariables) {
  const value = env[name];
  if (!value) continue;
  run(
    'vercel',
    ['env', 'add', name, '--environment', 'production', '--force', '--yes'],
    {
      input: `${value}\n`,
      encoding: 'utf8',
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  );
}

const deployment = spawnSync('vercel', ['deploy', '--prod', '--yes'], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['inherit', 'pipe', 'inherit'],
});
if (deployment.error) throw deployment.error;
process.stdout.write(deployment.stdout);
if (deployment.status !== 0) process.exit(deployment.status ?? 1);

const urls = deployment.stdout.match(/https:\/\/[^\s]+/g) ?? [];
const deploymentUrl = urls.at(-1)?.replace(/\x1B\[[0-9;]*m/g, '');
if (!deploymentUrl) {
  console.error('Deployment succeeded, but its URL could not be detected.');
  process.exit(1);
}

function verifyEndpoint(url) {
  const response = spawnSync('vercel', ['curl', url], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'inherit'],
  });
  if (response.error) throw response.error;
  process.stdout.write(response.stdout);
  if (response.status !== 0) process.exit(response.status ?? 1);

  try {
    const body = JSON.parse(response.stdout);
    if (body.status !== 'ok') throw new Error('Unexpected response body');
  } catch {
    console.error(`Live verification returned an invalid response: ${url}`);
    process.exit(1);
  }
}

verifyEndpoint(deploymentUrl);
verifyEndpoint(`${deploymentUrl}/api/health`);

console.log(`\nDeployment verified: ${deploymentUrl}`);
console.log(`Health endpoint: ${deploymentUrl}/api/health`);
