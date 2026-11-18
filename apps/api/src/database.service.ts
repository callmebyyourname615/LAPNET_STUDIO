import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { createDatabase } from "@lapnet/database";
import { readConfig } from "./config";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly client = createDatabase(readConfig().databaseUrl);
  async check() {
    await this.client.$queryRaw`SELECT 1 FROM departments LIMIT 1`;
  }
  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
