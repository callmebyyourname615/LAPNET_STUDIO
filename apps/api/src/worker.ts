import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app";
async function main() {
  process.env.PORTAL_WORKER = "1";
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  app.enableShutdownHooks();
  console.log(JSON.stringify({ event: "portal_worker_started" }));
}
main().catch(() => {
  console.error("Portal worker could not start.");
  process.exitCode = 1;
});
