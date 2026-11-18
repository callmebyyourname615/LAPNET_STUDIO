import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  taskPriorities,
  taskStatuses,
  type TaskPriority,
  type TaskStatus,
} from "@lapnet/contracts";
import { PaginationQuery } from "../http";

export class TaskFields {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Length(1, 200)
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  title!: string;
  @ApiProperty({ maxLength: 8000 }) @IsString() @MaxLength(8000) description!: string;
  @ApiProperty({ enum: taskPriorities }) @IsIn(taskPriorities) priority!: TaskPriority;
  @ApiPropertyOptional({ nullable: true, example: "2026-11-10" })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string | null;
  @ApiProperty() @IsUUID() assigneeId!: string;
  @ApiProperty({ type: [String], maxItems: 25 })
  @IsArray()
  @ArrayMaxSize(25)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  collaboratorIds!: string[];
  @ApiPropertyOptional({ type: [String], maxItems: 25 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  taggedDepartmentIds?: string[];
  @ApiPropertyOptional({
    deprecated: true,
    description:
      "Compatibility field; Host-selected participants receive team grants automatically",
  })
  @IsOptional()
  @IsBoolean()
  shareParticipants?: boolean;
}
export class CreateTaskInput extends TaskFields {
  @ApiProperty() @IsUUID() departmentId!: string;
}
export class RevisionInput {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) revision!: number;
}
export class UpdateTaskInput extends TaskFields {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) revision!: number;
}
export class TransitionInput extends RevisionInput {
  @ApiProperty({ enum: taskStatuses }) @IsIn(taskStatuses) status!: TaskStatus;
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}
export class TaskQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: ["true"] }) @IsOptional() @IsIn(["true"]) active?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ enum: taskStatuses })
  @IsOptional()
  @IsIn(taskStatuses)
  status?: TaskStatus;
  @ApiPropertyOptional({ enum: taskPriorities })
  @IsOptional()
  @IsIn(taskPriorities)
  priority?: TaskPriority;
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
  @ApiPropertyOptional({ enum: ["all", "mine", "created", "assigned", "team"] })
  @IsOptional()
  @IsIn(["all", "mine", "created", "assigned", "team"])
  view?: string;
  @ApiPropertyOptional({ enum: ["today", "overdue"] })
  @IsOptional()
  @IsIn(["today", "overdue"])
  due?: string;
}
export class TaskOptionsQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() taskId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
}
export class HistoryQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) before?: number;
}

export class DashboardQuery {
  @ApiPropertyOptional({ enum: ["mine", "all"] }) @IsIn(["mine", "all"]) view: "mine" | "all" =
    "mine";
  @ApiPropertyOptional({ enum: [14, 30] }) @Type(() => Number) @IsIn([14, 30]) days: 14 | 30 = 14;
}
