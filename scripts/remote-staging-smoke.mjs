import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const baseUrl = process.argv[2];

if (!baseUrl || !/^https:\/\/[-a-z0-9.]+\.workers\.dev$/i.test(baseUrl)) {
  console.error("Usage: node scripts/remote-staging-smoke.mjs https://<worker>.workers.dev");
  process.exit(1);
}

function putSecret(name, value) {
  const result = spawnSync(
    "pnpm",
    ["exec", "wrangler", "secret", "put", name, "--env", "staging"],
    { input: `${value}\n`, encoding: "utf8" },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }

  console.log(`${name}: configured`);
}

const authSecret = randomBytes(48).toString("base64url");
const bootstrapToken = randomBytes(32).toString("base64url");
const suffix = randomBytes(6).toString("hex");
const email = `staging-${suffix}@example.invalid`;
const password = randomBytes(24).toString("base64url");

putSecret("BETTER_AUTH_SECRET", authSecret);
putSecret("BOOTSTRAP_ADMIN_TOKEN", bootstrapToken);

const beforeResponse = await fetch(`${baseUrl}/api/v1/session`);
const before = await beforeResponse.json();
if (!beforeResponse.ok || !before.setupRequired) {
  console.error("Staging instance is not an empty, initialized test target.");
  process.exit(1);
}

const startedAt = performance.now();
const setupResponse = await fetch(`${baseUrl}/api/v1/setup`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: baseUrl,
  },
  body: JSON.stringify({
    token: bootstrapToken,
    name: "Staging Admin",
    username: `staging-${suffix}`,
    email,
    password,
  }),
});
const durationMs = Math.round(performance.now() - startedAt);

if (!setupResponse.ok) {
  console.error(`Remote setup failed with HTTP ${setupResponse.status}: ${await setupResponse.text()}`);
  process.exit(1);
}

const afterResponse = await fetch(`${baseUrl}/api/v1/session`);
const after = await afterResponse.json();
if (!afterResponse.ok || after.setupRequired) {
  console.error("Remote setup returned success but the instance remains uninitialized.");
  process.exit(1);
}

const loginStartedAt = performance.now();
const loginResponse = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: baseUrl,
  },
  body: JSON.stringify({ email, password }),
});
const loginDurationMs = Math.round(performance.now() - loginStartedAt);

if (!loginResponse.ok) {
  console.error(`Remote login failed with HTTP ${loginResponse.status}: ${await loginResponse.text()}`);
  process.exit(1);
}

console.log(JSON.stringify({
  workerUrl: baseUrl,
  setupStatus: setupResponse.status,
  passwordKdf: "scrypt N=32768 r=8 p=3",
  setupDurationMs: durationMs,
  loginStatus: loginResponse.status,
  loginDurationMs,
  setupRequiredAfter: after.setupRequired,
}, null, 2));
