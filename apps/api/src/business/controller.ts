import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  BadRequestException,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { UserImagesService } from "../identity/images.service";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { PortalRequest } from "../http";
import type { BusinessKind } from "@lapnet/contracts";
import { RevisionInput } from "../tasks/dto";
import { BusinessService } from "./business.service";
import {
  RecordInput,
  RecordQuery,
  CommentInput,
  ContactInput,
  MovementInput,
  LinkInput,
  MentionTargetsQuery,
} from "./dto";
function kind(r: PortalRequest): BusinessKind {
  const segment = r.path.split("/")[3];
  const map: Record<string, BusinessKind> = {
    posts: "post",
    companies: "company",
    documents: "document",
    interactions: "interaction",
  };
  if (!map[segment]) throw new BadRequestException();
  return map[segment];
}
const paths = ["posts", "companies", "documents", "interactions"];
@ApiCookieAuth()
@ApiTags("Business records")
@Controller()
export class BusinessController {
  constructor(
    private readonly business: BusinessService,
    private readonly images: UserImagesService,
  ) {}
  @Get(paths) list(@Req() r: PortalRequest, @Query() q: RecordQuery) {
    return this.business.list(r.principal!.user.id, kind(r), q);
  }
  @Post(paths) create(@Req() r: PortalRequest, @Body() input: RecordInput) {
    return this.business.write(r.principal!.user.id, kind(r), input, r.requestId);
  }
  @Get(paths.map((p) => p + "/:id")) detail(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.business.detail(r.principal!.user.id, kind(r), id);
  }
  @Patch(paths.map((p) => p + "/:id")) update(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: RecordInput,
  ) {
    return this.business.write(r.principal!.user.id, kind(r), input, r.requestId, id);
  }
  @Post(paths.map((p) => p + "/:id/archive")) archive(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: RevisionInput,
  ) {
    return this.business.archive(r.principal!.user.id, kind(r), id, input.revision, r.requestId);
  }
  @Get(paths.map((p) => p + "/:id/history")) history(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: RecordQuery,
  ) {
    return this.business.history(r.principal!.user.id, id, q);
  }
  @Get("mention-targets") targets(@Req() r: PortalRequest, @Query() q: MentionTargetsQuery) {
    return this.business.mentionTargets(r.principal!.user.id, q);
  }
  @Get("resources/:id/comments/:commentId/avatar") async commentAvatar(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("commentId", ParseUUIDPipe) commentId: string,
    @Res() response: Response,
  ) {
    const author = await this.business.commentAuthor(r.principal!.user.id, id, commentId);
    return this.images.get(author, "avatar", response);
  }
  @Get("resources/:id/comments/:commentId/profile") commentProfile(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("commentId", ParseUUIDPipe) commentId: string,
  ) {
    return this.business.taskCommentProfile(r.principal!.user.id, id, commentId);
  }
  @Get("resources/:id/comments/:commentId/cover") async commentCover(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("commentId", ParseUUIDPipe) commentId: string,
    @Res() response: Response,
  ) {
    const author = await this.business.commentAuthor(r.principal!.user.id, id, commentId, true);
    return this.images.get(author, "cover", response);
  }
  @Get("resources/:id/comments") comments(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: RecordQuery,
  ) {
    return this.business.comments(r.principal!.user.id, id, q);
  }
  @Post("resources/:id/comments") comment(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: CommentInput,
  ) {
    return this.business.comment(r.principal!.user.id, id, input, r.requestId);
  }
  @Patch("resources/:id/comments/:commentId") editComment(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("commentId", ParseUUIDPipe) commentId: string,
    @Body() input: CommentInput,
  ) {
    return this.business.comment(r.principal!.user.id, id, input, r.requestId, commentId);
  }
  @Post("resources/:id/comments/:commentId/archive") archiveComment(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("commentId", ParseUUIDPipe) commentId: string,
    @Body() input: CommentInput,
  ) {
    return this.business.comment(r.principal!.user.id, id, input, r.requestId, commentId, true);
  }
  @Get("companies/:id/contacts") contacts(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.business.contacts(r.principal!.user.id, id);
  }
  @Post("companies/:id/contacts") contact(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: ContactInput,
  ) {
    return this.business.contact(r.principal!.user.id, id, input, r.requestId);
  }
  @Patch("companies/:id/contacts/:contactId") editContact(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("contactId", ParseUUIDPipe) contactId: string,
    @Body() input: ContactInput,
  ) {
    return this.business.contact(r.principal!.user.id, id, input, r.requestId, contactId);
  }
  @Get("companies/:id/timeline") timeline(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: RecordQuery,
  ) {
    return this.business.timeline(r.principal!.user.id, id, q);
  }
  @Get("documents/:id/movements") movements(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.business.movements(r.principal!.user.id, id);
  }
  @Post("documents/:id/movements") movement(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: MovementInput,
  ) {
    return this.business.movement(r.principal!.user.id, id, input, r.requestId);
  }
  @Get("resources/:id/links") links(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.business.links(r.principal!.user.id, id);
  }
  @Post("resources/:id/links") link(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: LinkInput,
  ) {
    return this.business.link(r.principal!.user.id, id, input, r.requestId);
  }
}
