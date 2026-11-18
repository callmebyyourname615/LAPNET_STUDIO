import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, Res } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import type { PortalRequest } from "../http";
import { RecordQuery } from "./dto";
import { DiscoveryService } from "./discovery.service";
import { FilesService } from "./files.service";
@ApiCookieAuth()
@ApiTags("Discovery and documents")
@Controller()
export class OperationsController {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly files: FilesService,
  ) {}
  @Get("search") search(@Req() r: PortalRequest, @Query() q: RecordQuery) {
    return this.discovery.search(r.principal!.user.id, q);
  }
  @Get("notifications") notifications(@Req() r: PortalRequest, @Query() q: RecordQuery) {
    return this.discovery.notifications(r.principal!.user.id, q);
  }
  @Post("notifications/:id/read") read(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.discovery.read(r.principal!.user.id, id);
  }
  @Get("admin/jobs") jobs(@Req() r: PortalRequest) {
    return this.discovery.jobs(r.principal!.user.id);
  }
  @Post("admin/jobs/:id/retry") retryJob(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.discovery.retry(r.principal!.user.id, id);
  }
  @Get("documents/:id/versions") versions(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.files.versions(r.principal!.user.id, id);
  }
  @Post("documents/:id/versions") upload(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.files.upload(r.principal!.user.id, id, r);
  }
  @Post("document-versions/:id/retry") retry(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.files.retry(r.principal!.user.id, id, r.requestId);
  }
  @Get("document-versions/:id/download") download(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Res() response: Response,
  ) {
    return this.files.download(r.principal!.user.id, id, response, r.requestId);
  }
  @Get("document-versions/:id/preview") preview(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Res() response: Response,
  ) {
    return this.files.download(
      r.principal!.user.id,
      id,
      response,
      r.requestId,
      true,
      r.headers.range,
    );
  }
}
