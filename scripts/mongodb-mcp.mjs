// MongoDB MCP server for Claude Code, registered in .mcp.json and started with .env loaded,
// so the agent reads the same MONGODB_URI as the app. Read-only unless .env sets MDB_MCP_READ_ONLY=false.
import { spawn } from "node:child_process";

const uri = process.env.MDB_MCP_CONNECTION_STRING || process.env.MONGODB_URI;
if (!uri) {
  console.error("mongodb-mcp: set MONGODB_URI in .env (see .env.example)");
  process.exit(1);
}

const env = { MDB_MCP_READ_ONLY: "true", ...process.env, MDB_MCP_CONNECTION_STRING: uri };
const server = spawn("npx", ["-y", "mongodb-mcp-server@3.0.4"], { stdio: "inherit", env });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
