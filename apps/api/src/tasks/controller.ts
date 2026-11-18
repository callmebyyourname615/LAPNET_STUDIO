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
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { PortalRequest } from "../http";
import { BusinessService } from "../business/business.service";
import {
  CreateTaskInput,
  UpdateTaskInput,
  TransitionInput,
  TaskQuery,
  TaskOptionsQuery,
  HistoryQuery,
  RevisionInput,
  DashboardQuery,
} from "./dto";
import { TasksService } from "./tasks.service";

@ApiCookieAuth()
@ApiTags("Tasks")
@Controller("tasks")
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly business: BusinessService,
  ) {}
  @Get() list(@Req() r: PortalRequest, @Query() q: TaskQuery) {
    return this.tasks.list(r.principal!.user.id, q);
  }
  @Get("options") options(@Req() r: PortalRequest, @Query() q: TaskOptionsQuery) {
    return this.tasks.options(r.principal!.user.id, q);
  }
  @Get("dashboard") dashboard(@Req() r: PortalRequest, @Query() q: DashboardQuery) {
    return this.tasks.dashboard(r.principal!.user.id, q);
  }
  @Post() create(@Req() r: PortalRequest, @Body() input: CreateTaskInput) {
    return this.tasks.create(r.principal!.user.id, input, r.requestId);
  }
  @Get(":id") detail(@Req() r: PortalRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.tasks.detail(r.principal!.user.id, id);
  }
  @Patch(":id") update(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateTaskInput,
  ) {
    return this.tasks.update(r.principal!.user.id, id, input, r.requestId);
  }
  @Post(":id/transitions") transition(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: TransitionInput,
  ) {
    return this.tasks.transition(r.principal!.user.id, id, input, r.requestId);
  }
  @Post(":id/archive") archive(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: RevisionInput,
  ) {
    return this.tasks.archive(r.principal!.user.id, id, input.revision, r.requestId);
  }
  @Get(":id/history") history(
    @Req() r: PortalRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: HistoryQuery,
  ) {
    return this.tasks.revisions(r.principal!.user.id, id, q);
  }
  @Get(":id/documents") documents(@Req() r: PortalRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.business.taskDocuments(r.principal!.user.id, id);
  }
}
