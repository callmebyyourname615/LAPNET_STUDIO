export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const host = env.API_HOST ?? "127.0.0.1";
  const port = Number(env.API_PORT ?? "3100");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid API_PORT");
  const url = env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid database configuration");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    !parsed.username ||
    !parsed.password
  )
    throw new Error("Invalid database configuration");
  const origin = env.APP_ORIGIN ?? "http://127.0.0.1:5173";
  let application: URL;
  try {
    application = new URL(origin);
  } catch {
    throw new Error("Invalid APP_ORIGIN");
  }
  const development = env.NODE_ENV !== "production";
  const localHttp =
    development &&
    ["127.0.0.1", "localhost", "[::1]"].includes(application.hostname) &&
    application.protocol === "http:";
  if (application.origin !== origin || (!localHttp && application.protocol !== "https:"))
    throw new Error("APP_ORIGIN must be a trusted HTTPS origin or local development origin");
  if (env.API_TRUST_PROXY && env.API_TRUST_PROXY !== "1")
    throw new Error("Invalid API_TRUST_PROXY");
  const allowedOrigins = localHttp
    ? ["127.0.0.1", "localhost", "[::1]"].map(
        (hostname) => `http://${hostname}${application.port ? ":" + application.port : ""}`,
      )
    : [origin];
  return {
    host,
    port,
    databaseUrl: url,
    revision: env.RELEASE_REVISION ?? "development",
    origin,
    allowedOrigins,
    secureCookies: !localHttp,
    cookieName: localHttp ? "lapnet_session" : "__Host-lapnet_session",
    trustProxy: env.API_TRUST_PROXY === "1" ? 1 : false,
  };
}
