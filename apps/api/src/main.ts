import { createApplication } from "./app";
import { readConfig } from "./config";

async function main() {
  const config = readConfig();
  const app = await createApplication();
  const server = await app.listen(config.port, config.host);
  server.requestTimeout = 65000;
  server.headersTimeout = 10000;
  console.log(
    JSON.stringify({
      event: "api_started",
      host: config.host,
      port: config.port,
      phase: "identity",
    }),
  );
}
main().catch(() => {
  console.error(
    JSON.stringify({
      event: "api_start_failed",
      message: "Check API configuration and port availability.",
    }),
  );
  process.exitCode = 1;
});
