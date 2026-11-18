import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { PortalRequest } from "../http";
import { GrantInput } from "../identity/dto";
import { DocumentQuery, DocumentWorkspaceService } from "./document-workspace.service";

@ApiCookieAuth()
@ApiTags("Document workspace")
@Controller("document-workspace")
export class DocumentWorkspaceController {
  constructor(private readonly documents: DocumentWorkspaceService) {}
  @Get("config")
  @ApiOperation({ summary: "Authorized document catalogue, folders, limits and storage usage" })
  config(@Req() r: PortalRequest) {
    return this.documents.config(r.principal!.user.id);
  }
  @Get("folders") folders(@Req() r: PortalRequest) {
    return this.documents.folders(r.principal!.user.id);
  }
  @Post("folders") createFolder(@Req() r: PortalRequest, @Body() input: unknown) {
    return this.documents.createFolder(r.principal!.user.id, input, r.requestId);
  }
  @Patch("folders/:id") updateFolder(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: unknown,
  ) {
    return this.documents.updateFolder(r.principal!.user.id, id, input, r.requestId);
  }
  @Delete("folders/:id") deleteFolder(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: unknown,
  ) {
    return this.documents.deleteFolder(r.principal!.user.id, id, input, r.requestId);
  }
  @Get("documents") list(@Req() r: PortalRequest, @Query() q: DocumentQuery) {
    return this.documents.list(r.principal!.user.id, q);
  }
  @Get("documents/:id") detail(@Req() r: PortalRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.documents.detail(r.principal!.user.id, id);
  }
  @Post("register")
  @ApiOperation({
    summary:
      "Atomically register a document and its first quarantined file; octet-stream body, URI-encoded JSON X-Document-Metadata header",
  })
  register(@Req() r: PortalRequest) {
    return this.documents.register(r.principal!.user.id, r);
  }
  @Patch("documents/:id") update(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: unknown,
  ) {
    return this.documents.update(r.principal!.user.id, id, input, r.requestId);
  }
  @Post("documents/:id/grants") share(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: GrantInput,
  ) {
    return this.documents.share(r.principal!.user.id, id, input, r.requestId);
  }
  @Delete("documents/:id/grants/:grantId") revoke(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("grantId", ParseUUIDPipe) grantId: string,
  ) {
    return this.documents.revoke(r.principal!.user.id, id, grantId, r.requestId);
  }
  @Delete("documents/:id/links/:linkId") unlink(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("linkId", ParseUUIDPipe) linkId: string,
  ) {
    return this.documents.unlink(r.principal!.user.id, id, linkId, r.requestId);
  }
}
