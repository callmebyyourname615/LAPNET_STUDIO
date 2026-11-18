import { randomUUID } from "node:crypto";
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  CanActivate,
  ExecutionContext,
  ValidationPipe,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService } from "./identity/auth.service";
import type { SessionPrincipal } from "./identity/types";
import { Request, Response } from "express";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

export const PUBLIC_ENDPOINT = "lapnet:public";
export type PortalRequest = Request & { requestId: string; principal?: SessionPrincipal };

export const validationPipe = () =>
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    validationError: { target: false, value: false },
  });

export class PaginationQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9_-]+$/)
  cursor?: string;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ENDPOINT, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<PortalRequest>();
    request.principal = await this.auth.authenticate(request);
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method))
      this.auth.checkCsrf(request, request.principal);
    return true;
  }
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<PortalRequest>();
    const response = host.switchToHttp().getResponse<Response>();
    const parserStatus =
      error instanceof Error && "status" in error && (error.status === 400 || error.status === 413)
        ? error.status
        : 500;
    const status = error instanceof HttpException ? error.getStatus() : parserStatus;
    const messages: Record<number, [string, string]> = {
      400: ["VALIDATION_FAILED", "The request is invalid."],
      401: ["AUTHENTICATION_REQUIRED", "Authentication is required."],
      403: ["ACCESS_DENIED", "Access is denied."],
      404: ["NOT_FOUND", "The requested endpoint is unavailable."],
      409: ["CONFLICT", "The record changed or conflicts with an existing record."],
      429: ["RATE_LIMITED", "Please wait before trying again."],
      413: ["PAYLOAD_TOO_LARGE", "The request is too large."],
      503: ["DEPENDENCY_UNAVAILABLE", "The service is temporarily unavailable."],
    };
    const databaseConflict =
      error instanceof Error &&
      "code" in error &&
      (error.code === "P2002" || error.code === "P2003" || error.code === "P2034");
    const missingRecord = error instanceof Error && "code" in error && error.code === "P2025";
    const resolvedStatus = missingRecord ? 404 : databaseConflict ? 409 : status;
    const [code, message] = messages[resolvedStatus] ?? [
      "INTERNAL_ERROR",
      "The request could not be completed.",
    ];
    response.status(resolvedStatus).json({
      error: {
        code,
        message,
        requestId: request.requestId ?? randomUUID(),
        timestamp: new Date().toISOString(),
      },
    });
  }
}
