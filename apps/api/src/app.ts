import "reflect-metadata";
import { BusinessService } from "./business/business.service";
import { BusinessController } from "./business/controller";
import { DiscoveryService } from "./business/discovery.service";
import { FilesService } from "./business/files.service";
import { WorkerService } from "./business/worker.service";
import { OperationsController } from "./business/operations.controller";
import { DocumentWorkspaceController } from "./business/document-workspace.controller";
import { DocumentWorkspaceService } from "./business/document-workspace.service";
import { randomUUID } from "node:crypto";
import {
  Controller,
  Get,
  Module,
  Req,
  SetMetadata,
  ForbiddenException,
  ServiceUnavailableException,
  RequestMethod,
} from "@nestjs/common";
import { NestFactory, APP_GUARD } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import helmet from "helmet";
import { NextFunction, Response } from "express";
import { DatabaseService } from "./database.service";
import {
  ApiExceptionFilter,
  SessionGuard,
  PortalRequest,
  PUBLIC_ENDPOINT,
  validationPipe,
} from "./http";
import type { VersionResponse } from "@lapnet/contracts";
import { AuthService } from "./identity/auth.service";
import { UserImagesController, AccountProfileController } from "./identity/images.controller";
import { UserImagesService } from "./identity/images.service";
import { AccountProfileService } from "./identity/profile.service";
import { AuthorizationService } from "./identity/authorization.service";
import { OrganizationService } from "./identity/organization.service";
import { ResourcesService } from "./identity/resources.service";
import { AuthController, IdentityController, ResourcesController } from "./identity/controllers";
import { readConfig } from "./config";
import { TasksController } from "./tasks/controller";
import { TasksService } from "./tasks/tasks.service";

@ApiTags("Foundation")
@Controller("health")
class HealthController {
  constructor(private readonly database: DatabaseService) {}
  @Get("live")
  @SetMetadata(PUBLIC_ENDPOINT, true)
  @ApiOperation({ summary: "Minimal process liveness" })
  live() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  @Get("ready")
  @SetMetadata(PUBLIC_ENDPOINT, true)
  @ApiOperation({ summary: "Database readiness, loopback clients only" })
  @ApiResponse({ status: 503, description: "Required dependency unavailable" })
  async ready(@Req() request: PortalRequest) {
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress ?? ""))
      throw new ForbiddenException();
    try {
      await this.database.check();
    } catch {
      throw new ServiceUnavailableException();
    }
    return { status: "ready", timestamp: new Date().toISOString() };
  }
}

@ApiTags("Foundation")
@Controller("version")
class VersionController {
  @Get()
  @SetMetadata(PUBLIC_ENDPOINT, true)
  @ApiOperation({ summary: "Release identifier without environment details" })
  version(): VersionResponse {
    return {
      application: "lapnet-studio-portal",
      version: "0.2.0",
      revision: (process.env.RELEASE_REVISION ?? "development").slice(0, 80),
      timestamp: new Date().toISOString(),
    };
  }
}

@Module({
  controllers: [
    HealthController,
    VersionController,
    AuthController,
    UserImagesController,
    AccountProfileController,
    IdentityController,
    ResourcesController,
    TasksController,
    BusinessController,
    OperationsController,
    DocumentWorkspaceController,
  ],
  providers: [
    DatabaseService,
    AuthService,
    UserImagesService,
    AccountProfileService,
    AuthorizationService,
    OrganizationService,
    ResourcesService,
    TasksService,
    BusinessService,
    DiscoveryService,
    FilesService,
    DocumentWorkspaceService,
    WorkerService,
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AppModule {}

export async function createApplication(database?: Pick<DatabaseService, "check">, logging = true) {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
    bodyParser: false,
  });
  if (database) app.get(DatabaseService).check = database.check.bind(database);
  app.set("trust proxy", readConfig().trustProxy);
  app.use((request: PortalRequest, response: Response, next: NextFunction) => {
    request.requestId = randomUUID();
    response.setHeader("X-Request-ID", request.requestId);
    response.setHeader("Cache-Control", "no-store");
    const start = performance.now();
    response.on("finish", () => {
      if (logging)
        console.log(
          JSON.stringify({
            event: "http_request",
            requestId: request.requestId,
            method: request.method,
            status: response.statusCode,
            durationMs: Math.round(performance.now() - start),
          }),
        );
    });
    next();
  });
  app.use(helmet());
  app.useBodyParser("json", { limit: "64kb" });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(validationPipe());
  app.setGlobalPrefix("api/v1", {
    exclude: [
      { path: "health/(.*)", method: RequestMethod.ALL },
      { path: "auth/(.*)", method: RequestMethod.ALL },
    ],
  });
  app.enableShutdownHooks();
  return app;
}
