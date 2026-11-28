import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const child = spawn(process.execPath, [
  "--import", fileURLToPath(import.meta.resolve("tsx")),
  fileURLToPath(new URL("./mcp-stdio.ts", import.meta.url)),
], { stdio: "inherit", env: process.env });

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => { process.exitCode = code ?? 1; });
