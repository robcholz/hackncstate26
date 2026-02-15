import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";

const require = createRequire(import.meta.url);
const electronBinaryPath = require("electron");
const forwardedArgs = process.argv.slice(2);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinaryPath, ["electron/main.mjs", ...forwardedArgs], {
  stdio: "inherit",
  env
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
