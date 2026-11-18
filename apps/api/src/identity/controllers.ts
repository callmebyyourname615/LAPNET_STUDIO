import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  Req,
  Res,
  SetMetadata,
  ParseUUIDPipe,
} from "@nestjs/common";
import type { Response } from "express";
import { ApiTags, ApiCookieAuth } from "@nestjs/swagger";
import { PUBLIC_ENDPOINT, type PortalRequest } from "../http";
import { AuthService } from "./auth.service";
import { OrganizationService } from "./organization.service";
import { ResourcesService } from "./resources.service";
import {
  LoginInput,
  PasswordChangeInput,
  UserCreateInput,
  UserUpdateInput,
  DirectoryQuery,
  DepartmentInput,
  DepartmentUpdateInput,
  MembershipInput,
  PositionAssignmentInput,
  RoleInput,
  GrantInput,
} from "./dto";

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post("login")
  @SetMetadata(PUBLIC_ENDPOINT, true)
  login(
    @Req() request: PortalRequest,
    @Body() input: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.login(request, input.username, input.password, response, input.rememberMe);
  }
  @Post("logout")
  logout(@Req() request: PortalRequest, @Res({ passthrough: true }) response: Response) {
    return this.auth.logout(request.principal!, response, request.requestId);
  }
  @Post("change-password")
  change(
    @Req() request: PortalRequest,
    @Body() input: PasswordChangeInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.changePassword(
      request.principal!,
      input.currentPassword,
      input.newPassword,
      response,
      request.requestId,
    );
  }
}

@ApiCookieAuth()
@ApiTags("Identity and organization")
@Controller()
export class IdentityController {
  constructor(
    private readonly auth: AuthService,
    private readonly organization: OrganizationService,
  ) {}
  @Get("me")
  me(@Req() r: PortalRequest) {
    return this.auth.me(r.principal!);
  }
  @Get("users") users(@Req() r: PortalRequest, @Query() q: DirectoryQuery) {
    return this.organization.listUsers(r.principal!.user.id, q);
  }
  @Post("users") createUser(@Req() r: PortalRequest, @Body() input: UserCreateInput) {
    return this.organization.createUser(r.principal!.user.id, input, r.requestId);
  }
  @Patch("users/:id") updateUser(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UserUpdateInput,
  ) {
    return this.organization.updateUser(r.principal!.user.id, id, input, r.requestId);
  }
  @Post("users/:id/reset-password") reset(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.organization.resetPassword(r.principal!.user.id, id, r.requestId);
  }
  @Get("organization") organizationData(@Req() r: PortalRequest) {
    return this.organization.organization(r.principal!.user.id);
  }
  @Get("departments") async departments(@Req() r: PortalRequest) {
    return (await this.organization.organization(r.principal!.user.id)).departments;
  }
  @Get("positions") async positions(@Req() r: PortalRequest) {
    return (await this.organization.organization(r.principal!.user.id)).positions;
  }
  @Post("departments") createDepartment(@Req() r: PortalRequest, @Body() input: DepartmentInput) {
    return this.organization.createDepartment(r.principal!.user.id, input, r.requestId);
  }
  @Patch("departments/:id") updateDepartment(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: DepartmentUpdateInput,
  ) {
    return this.organization.updateDepartment(r.principal!.user.id, id, input, r.requestId);
  }
  @Post("memberships") membership(@Req() r: PortalRequest, @Body() input: MembershipInput) {
    return this.organization.membership(r.principal!.user.id, input, r.requestId);
  }
  @Delete("memberships/:id") endMembership(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.organization.endMembership(r.principal!.user.id, id, r.requestId);
  }
  @Post("position-assignments") position(
    @Req() r: PortalRequest,
    @Body() input: PositionAssignmentInput,
  ) {
    return this.organization.assignPosition(r.principal!.user.id, input, r.requestId);
  }
  @Delete("position-assignments/:id") endPosition(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.organization.endPosition(r.principal!.user.id, id, r.requestId);
  }
  @Get("roles") roles(@Req() r: PortalRequest) {
    return this.organization.roles(r.principal!.user.id);
  }
  @Post("roles") role(@Req() r: PortalRequest, @Body() input: RoleInput) {
    return this.organization.assignRole(r.principal!.user.id, input, r.requestId);
  }
  @Delete("roles/:id") revokeRole(@Req() r: PortalRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.organization.revokeRole(r.principal!.user.id, id, r.requestId);
  }
}

@ApiCookieAuth()
@ApiTags("Resource permissions")
@Controller("resources")
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}
  @Get() list(@Req() r: PortalRequest, @Query() q: DirectoryQuery) {
    return this.resources.list(r.principal!.user.id, q);
  }
  @Get(":id") detail(@Req() r: PortalRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.resources.detail(r.principal!.user.id, id);
  }
  @Get(":id/grants") grants(@Req() r: PortalRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.resources.grants(r.principal!.user.id, id);
  }
  @Get(":id/share-targets") targets(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: DirectoryQuery,
  ) {
    return this.resources.targets(r.principal!.user.id, id, q);
  }
  @Post(":id/grants") share(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: GrantInput,
  ) {
    return this.resources.share(r.principal!.user.id, id, input, r.requestId);
  }
  @Delete(":id/grants/:grantId") revoke(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("grantId", ParseUUIDPipe) grantId: string,
  ) {
    return this.resources.revoke(r.principal!.user.id, id, grantId, r.requestId);
  }
}
