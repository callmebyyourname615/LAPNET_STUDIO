import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { PortalRequest } from "../http";
import { AuditService } from "./audit.service";

@ApiCookieAuth()
@ApiTags("Audit logs")
@Controller()
export class AuditController {
  constructor(private readonly audit: AuditService) {}
  @Get("audit-events")
  @ApiOperation({ summary: "System-wide audit logs; current global portal_admin only" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "cursor", required: false })
  @ApiQuery({ name: "q", required: false })
  @ApiQuery({ name: "actor", required: false })
  @ApiQuery({
    name: "category",
    required: false,
    enum: [
      "auth",
      "account",
      "task",
      "document",
      "organization",
      "resource",
      "activity",
      "company",
      "post",
      "interaction",
    ],
  })
  @ApiQuery({ name: "outcome", required: false, enum: ["success", "failure"] })
  @ApiQuery({ name: "from", required: false, description: "Inclusive ISO timestamp" })
  @ApiQuery({ name: "to", required: false, description: "Exclusive ISO timestamp" })
  list(@Req() r: PortalRequest, @Query() query: Record<string, unknown>) {
    return this.audit.list(r.principal!.user.id, query);
  }
  @Post("activity/page-view")
  @ApiOperation({ summary: "Record a signed-in user's reported navigation; no query strings" })
  page(@Req() r: PortalRequest, @Body() body: unknown) {
    return this.audit.page(r, body);
  }
}
