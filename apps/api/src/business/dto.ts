import { Type } from "class-transformer";
import {
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
  Matches,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PaginationQuery } from "../http";
export class MentionInput {
  @ApiProperty({ enum: ["user", "department", "position"] })
  @IsIn(["user", "department", "position"])
  type!: "user" | "department" | "position";
  @ApiProperty() @IsUUID() id!: string;
}
export class RecordInput {
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @ApiProperty() @IsObject() data!: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) revision?: number;
  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayMaxSize(25)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  shareUsers: string[] = [];
  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  shareDepartments: string[] = [];
  @ApiPropertyOptional({ type: [MentionInput] })
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => MentionInput)
  mentions: MentionInput[] = [];
}
export class RecordQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() companyId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(["incoming", "outgoing", "internal"])
  direction?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(["post", "company", "interaction", "document", "task"])
  kind?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}
export class NotificationQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: ["all", "unread", "mentions", "tasks", "comments"] })
  @IsOptional()
  @IsIn(["all", "unread", "mentions", "tasks", "comments"])
  view?: "all" | "unread" | "mentions" | "tasks" | "comments";
}
export class CommentInput {
  @ApiProperty() @IsString() @Length(1, 4000) text!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) revision?: number;
  @ApiPropertyOptional({ type: [MentionInput] })
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => MentionInput)
  mentions: MentionInput[] = [];
}
export class ContactInput {
  @ApiProperty() @IsString() @Length(1, 120) displayName!: string;
  @ApiPropertyOptional() @IsString() @MaxLength(120) position = "";
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(254) email?: string | null;
  @ApiPropertyOptional() @IsString() @MaxLength(50) phone = "";
  @ApiPropertyOptional() @IsBoolean() active = true;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) revision?: number;
}
export class MovementInput {
  @ApiProperty() @IsIn(["incoming", "outgoing"]) direction!: string;
  @ApiProperty() @Matches(/^\d{4}-\d{2}-\d{2}$/) occurredOn!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() counterpartyId?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(200) reference = "";
  @ApiPropertyOptional() @IsString() @MaxLength(2000) note = "";
  @ApiPropertyOptional() @IsString() @MaxLength(200) counterpartyName = "";
}
export class LinkInput {
  @ApiProperty() @IsUUID() targetId!: string;
  @ApiPropertyOptional() @IsIn(["related", "follow_up", "attachment", "company"]) kind = "related";
}
