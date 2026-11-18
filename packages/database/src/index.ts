import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

export function createDatabase(connectionString: string) {
  const adapter = new PrismaPg({
    connectionString,
    // Prisma's timestamp parser must receive UTC, independent of the host's display timezone.
    options: "-c timezone=UTC",
    max: 5,
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 10000,
    statement_timeout: 3000,
  });
  return new PrismaClient({ adapter, log: [] });
}
export type Database = ReturnType<typeof createDatabase>;
export type { Prisma } from "./generated/client";
