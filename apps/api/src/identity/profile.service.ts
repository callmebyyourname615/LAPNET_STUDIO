import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { accountProfileUpdateSchema } from "@lapnet/contracts";
import { DatabaseService } from "../database.service";
import { AuthorizationService } from "./authorization.service";
import type { PortalRequest } from "../http";

@Injectable()
export class AccountProfileService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
  ) {}
  async update(r: PortalRequest, input: unknown) {
    const parsed = accountProfileUpdateSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException();
    const { displayName, revision, ...fields } = parsed.data,
      principal = r.principal!;
    return this.database.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${principal.user.id}::uuid FOR UPDATE`;
      const user = await tx.user.findFirst({
        where: {
          id: principal.user.id,
          status: "active",
          credentialVersion: principal.user.credentialVersion,
        },
      });
      const session = await tx.session.findFirst({
        where: {
          id: principal.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          idleExpiresAt: { gt: new Date() },
        },
      });
      if (!user || !session) throw new UnauthorizedException();
      const old = await tx.userProfile.findUnique({ where: { userId: user.id } });
      if ((old?.revision ?? 0) !== revision) throw new ConflictException();
      await tx.user.update({ where: { id: user.id }, data: { displayName } });
      const profile = await tx.userProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...fields },
        update: { ...fields, revision: { increment: 1 } },
      });
      await this.authorization.audit(tx, user.id, "account.profile_updated", user.id, r.requestId, {
        revision: profile.revision,
      });
      return { revision: profile.revision };
    });
  }
}
