import { Body, Controller, Delete, Get, Param, Patch, Put, Req, Res } from "@nestjs/common";
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import type { PortalRequest } from "../http";
import { imageKind, UserImagesService } from "./images.service";
import { AccountProfileService } from "./profile.service";

@ApiCookieAuth()
@ApiTags("Account profile")
@Controller("me/profile")
export class AccountProfileController {
  constructor(private readonly profile: AccountProfileService) {}
  @Patch() update(@Req() r: PortalRequest, @Body() input: unknown) {
    return this.profile.update(r, input);
  }
}

@ApiCookieAuth()
@ApiTags("Account images")
@Controller("me/images")
export class UserImagesController {
  constructor(private readonly images: UserImagesService) {}
  @Put(":kind")
  @ApiOperation({
    summary:
      "Replace your avatar or cover with a normalized image (JPEG, PNG or WebP; up to 8 MiB)",
  })
  @ApiConsumes("application/octet-stream")
  @ApiBody({ schema: { type: "string", format: "binary" } })
  upload(@Req() r: PortalRequest, @Param("kind") kind: string) {
    return this.images.upload(r, imageKind(kind));
  }
  @Get(":kind") get(
    @Req() r: PortalRequest,
    @Param("kind") kind: string,
    @Res() response: Response,
  ) {
    return this.images.get(r.principal!.user.id, imageKind(kind), response);
  }
  @Delete(":kind") remove(@Req() r: PortalRequest, @Param("kind") kind: string) {
    return this.images.remove(r.principal!.user.id, imageKind(kind), r.requestId);
  }
}
