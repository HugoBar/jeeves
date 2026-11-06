// Runs before `pnpm dev` and `pnpm dev:empty`: makes sure the development
// Postgres is up. If DATABASE_URL already answers, nothing happens, so a
// Postgres of your own works as before. Otherwise, for a local DATABASE_URL,
// it starts Docker Desktop if Docker isn't running yet, waits for it, and
// starts the database in docker-compose.dev.yml (as `pnpm db:up` does). Without
// Docker it only warns, and the dev server starts anyway.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { connect } from "node:net";

const DOCKER_WAIT_MS = 120_000;
const COMPOSE = ["compose", "-f", "docker-compose.dev.yml", "-p", "jeeves-dev", "up", "-d", "--wait"];
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]"];

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn("DATABASE_URL is not set, so the database was not started.");
  process.exit(0);
}
const { hostname, port } = new URL(url);

if (await answers(hostname, Number(port || 5432))) process.exit(0);
if (!LOCAL_HOSTS.includes(hostname)) {
  console.warn(`The database at ${hostname} does not answer. Only a local one is started here.`);
  process.exit(0);
}
if (!dockerInstalled()) {
  console.warn("The database does not answer, and Docker was not found to start one.");
  process.exit(0);
}
if (!dockerRunning()) {
  console.log("Starting Docker...");
  if (!startDocker()) {
    console.warn("Docker is not running, and it could not be started here. Start it, then run `pnpm db:up`.");
    process.exit(0);
  }
  if (!(await waitFor(dockerRunning, DOCKER_WAIT_MS))) {
    console.warn("Docker did not start in time. Once it is up, run `pnpm db:up`.");
    process.exit(0);
  }
}
console.log("Starting the development database...");
const up = spawnSync("docker", COMPOSE, { stdio: "inherit" });
process.exit(up.status === 0 ? 0 : 1);

// Whether something accepts connections at host:port.
function answers(host, portNumber) {
  return new Promise((resolve) => {
    const socket = connect({ host: host.replace(/^\[|\]$/g, ""), port: portNumber });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1000, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

function dockerInstalled() {
  return spawnSync("docker", ["--version"], { stdio: "ignore" }).status === 0;
}

function dockerRunning() {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
}

// Opens Docker Desktop on Windows and macOS. Elsewhere Docker runs as a
// service, which this leaves alone.
function startDocker() {
  if (process.platform === "darwin") {
    return spawnSync("open", ["-a", "Docker"], { stdio: "ignore" }).status === 0;
  }
  if (process.platform === "win32") {
    const app = join(process.env.ProgramFiles ?? "C:\\Program Files", "Docker", "Docker", "Docker Desktop.exe");
    if (!existsSync(app)) return false;
    spawn(app, [], { detached: true, stdio: "ignore" }).unref();
    return true;
  }
  return false;
}

async function waitFor(check, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}
