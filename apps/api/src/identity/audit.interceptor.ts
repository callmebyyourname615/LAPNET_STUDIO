import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { defer, lastValueFrom } from "rxjs";
import type { Response } from "express";
import type { PortalRequest } from "../http";
import { AuditService, auditStatus } from "./audit.service";

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<PortalRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const started = performance.now();
    return defer(async () => {
      let result: unknown;
      try {
        result = await lastValueFrom(next.handle());
      } catch (error) {
        await this.audit.request(request, auditStatus(error), performance.now() - started);
        throw error;
      }
      await this.audit.request(request, response.statusCode, performance.now() - started);
      return result;
    });
  }
}
