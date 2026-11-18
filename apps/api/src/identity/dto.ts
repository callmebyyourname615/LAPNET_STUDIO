import { Transform } from "class-transformer";
import {
  IsString,
  IsOptional,
  IsIn,
  IsUUID,
  Length,
  MaxLength,
  IsEmail,
  IsDateString,
  Matches,
  IsBoolean,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PaginationQuery } from "../http";

export class LoginInput {
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() rememberMe = false;
  @ApiProperty()
  @IsString()
  @Length(3, 64)
  @Matches(/^[A-Za-z0-9._-]+$/)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  username!: string;
  @ApiProperty({ format: "password", minLength: 6, maxLength: 128 })
  @IsString()
  @Length(6, 128)
  password!: string;
}
export class PasswordChangeInput {
  @ApiProperty({ format: "password" }) @IsString() @Length(1, 128) currentPassword!: string;
  @ApiProperty({ format: "password", minLength: 6, maxLength: 128 })
  @IsString()
  @Length(6, 128)
  newPassword!: string;
}
export class UserCreateInput {
  @ApiProperty()
  @IsString()
  @Length(3, 64)
  @Matches(/^[a-z0-9._-]+$/)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  username!: string;
  @ApiProperty() @IsString() @Length(1, 100) displayName!: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(254) email?: string;
}
export class UserUpdateInput {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) displayName?: string;
  @ApiPropertyOptional({ enum: ["active", "disabled"] })
  @IsOptional()
  @IsIn(["active", "disabled"])
  status?: "active" | "disabled";
}
export class DepartmentInput {
  @ApiProperty() @IsString() @Length(2, 30) @Matches(/^[A-Z][A-Z0-9_]+$/) code!: string;
  @ApiProperty() @IsString() @Length(1, 100) name!: string;
}
export class DepartmentUpdateInput {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
export class EffectiveDates {
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveTo?: string;
}
export class MembershipInput extends EffectiveDates {
  @ApiProperty() @IsUUID() userId!: string;
  @ApiProperty() @IsUUID() departmentId!: string;
  @ApiPropertyOptional({ enum: ["member", "manager"] })
  @IsOptional()
  @IsIn(["member", "manager"])
  membershipRole: "member" | "manager" = "member";
}
export class PositionAssignmentInput extends EffectiveDates {
  @ApiProperty() @IsUUID() userId!: string;
  @ApiProperty() @IsUUID() positionId!: string;
}
export class RoleInput extends EffectiveDates {
  @ApiProperty() @IsUUID() userId!: string;
  @ApiProperty({ enum: ["portal_admin", "resource_viewer", "resource_editor"] })
  @IsIn(["portal_admin", "resource_viewer", "resource_editor"])
  role!: "portal_admin" | "resource_viewer" | "resource_editor";
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
}
export class GrantInput {
  @ApiPropertyOptional() @IsOptional() @IsUUID() userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
  @ApiProperty({ enum: ["view", "comment", "edit", "manage_access", "download"] })
  @IsIn(["view", "comment", "edit", "manage_access", "download"])
  permission!: "view" | "comment" | "edit" | "manage_access" | "download";
}
export class DirectoryQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
}
