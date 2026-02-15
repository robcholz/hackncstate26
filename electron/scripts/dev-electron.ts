import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const host = process.env.ELECTRON_NEXT_HOST ?? "127.0.0.1";
const port = process.env.ELECTRON_NEXT_PORT ?? "3001";
const startUrl = process.env.ELECTRON_START_URL ?? `http://${host}:${port}`;
const healthCheckUrl = `${startUrl}/open`;
const forwardedArgs = process.argv.slice(2);

let shuttingDown = false;
let electronProcess: ReturnType<typeof spawn> | null = null;

const nextProcess = spawn(npmCommand, ["--prefix", "..", "run", "dev", "--", "--hostname", host, "--port", port], {
  stdio: "inherit",
  env: {
    ...process.env,
    HOSTNAME: host,
    PORT: port
  }
});

nextProcess.on("exit", (code) => {
  if (shuttingDown) return;

  console.error(`Next.js dev server exited early with code ${code ?? 0}`);
  shutdown(code ?? 1);
});

void bootElectron();

async function bootElectron() {
  const isReady = await waitForServer(healthCheckUrl);
  if (!isReady) {
    console.error(`Timed out waiting for ${healthCheckUrl}`);
    shutdown(1);
    return;
  }

  const electronArgs = ["run", "electron", "--", ...forwardedArgs];
  electronProcess = spawn(npmCommand, electronArgs, {
    stdio: "inherit",
    env: {
      ...process.env,
      ELECTRON_START_URL: startUrl
    }
  });

  electronProcess.on("exit", (code) => {
    shutdown(code ?? 0);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function shutdown(code: number) {
  if (shuttingDown) return;
  shuttingDown = true;

  terminateProcess(electronProcess);
  terminateProcess(nextProcess);

  setTimeout(() => {
    process.exit(code);
  }, 300);
}

function terminateProcess(child: ReturnType<typeof spawn> | null) {
  if (!child || child.killed) return;

  child.kill("SIGTERM");
}

async function waitForServer(url: string): Promise<boolean> {
  const maxAttempts = 100;
  const delayMs = 400;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await canReach(url)) {
      return true;
    }

    await delay(delayMs);
  }

  return false;
}

async function canReach(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal
    });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
