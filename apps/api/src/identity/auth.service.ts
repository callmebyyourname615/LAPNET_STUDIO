import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  HttpException,
  ConflictException,
} from "@nestjs/common";
import { DatabaseService } from "../database.service";
import { readConfig } from "../config";
import type { PortalRequest } from "../http";
import type { Response } from "express";
import type { SessionPrincipal } from "./types";
import { AuthorizationService, type Transaction, current } from "./authorization.service";
import { hashPassword, verifyPassword, randomSecret, secretHash, equalSecret } from "./password";
import { accountProfileSchema } from "@lapnet/contracts";

@Injectable()
export class AuthService {
  private readonly config = readConfig();
  private readonly dummyHash = hashPassword(randomSecret());
  private hashing = 0;
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
  ) {}
  requireOrigin(request: PortalRequest) {
    if (
      !this.config.allowedOrigins.includes(request.headers.origin ?? "") ||
      request.headers["sec-fetch-site"] === "cross-site"
    )
      throw new ForbiddenException();
  }
  private token(request: PortalRequest) {
    const header = request.headers.cookie ?? "";
    if (header.length > 4096) return undefined;
    const entries = header
      .split(";")
      .map((x) => x.trim())
      .filter((x) => x.startsWith(this.config.cookieName + "="));
    if (entries.length !== 1) return undefined;
    const token = entries[0].slice(this.config.cookieName.length + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
  }
  async authenticate(request: PortalRequest): Promise<SessionPrincipal> {
    const token = this.token(request);
    if (!token) throw new UnauthorizedException();
    const now = new Date();
    const session = await this.database.client.session.findUnique({
      where: { tokenHash: secretHash(token) },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.idleExpiresAt <= now ||
      session.user.status !== "active" ||
      session.credentialVersion !== session.user.credentialVersion
    )
      throw new UnauthorizedException();
    if (session.idleExpiresAt.getTime() - now.getTime() < 29 * 60 * 1000) {
      await this.database.client.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: {
          idleExpiresAt: new Date(
            Math.min(now.getTime() + 30 * 60 * 1000, session.expiresAt.getTime()),
          ),
        },
      });
    }
    return {
      id: session.id,
      csrfSecret: session.csrfSecret,
      rememberMe: session.rememberMe,
      user: session.user,
    };
  }
  checkCsrf(request: PortalRequest, principal: SessionPrincipal) {
    this.requireOrigin(request);
    const supplied = request.headers["x-csrf-token"];
    if (
      typeof supplied !== "string" ||
      supplied.length > 100 ||
      !equalSecret(supplied, principal.csrfSecret)
    )
      throw new ForbiddenException();
  }
  private async throttle(key: string, limit: number) {
    const keyHash = secretHash(key);
    const rows = await this.database.client.$queryRaw<
      { attempts: number }[]
    >`INSERT INTO login_throttles(key_hash,attempts,window_started_at) VALUES(${keyHash},1,now()) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN login_throttles.window_started_at<now()-interval '15 minutes' THEN 1 ELSE login_throttles.attempts+1 END,window_started_at=CASE WHEN login_throttles.window_started_at<now()-interval '15 minutes' THEN now() ELSE login_throttles.window_started_at END RETURNING attempts`;
    if (rows[0].attempts > limit) throw new HttpException("Too many attempts", 429);
  }
  private async verify(encoded: string, password: string) {
    if (this.hashing >= 4) throw new HttpException("Too many attempts", 429);
    this.hashing++;
    try {
      return await verifyPassword(encoded, password);
    } finally {
      this.hashing--;
    }
  }
  private async issue(
    db: Transaction,
    user: { id: string; credentialVersion: number },
    rememberMe = false,
  ) {
    const token = randomSecret();
    const now = Date.now();
    const session = await db.session.create({
      data: {
        tokenHash: secretHash(token),
        csrfSecret: randomSecret(),
        rememberMe,
        userId: user.id,
        credentialVersion: user.credentialVersion,
        expiresAt: new Date(now + 8 * 60 * 60 * 1000),
        idleExpiresAt: new Date(now + 30 * 60 * 1000),
      },
    });
    return { token, session };
  }
  setCookie(response: Response, token: string, rememberMe = false) {
    response.cookie(this.config.cookieName, token, {
      httpOnly: true,
      secure: this.config.secureCookies,
      sameSite: "lax",
      path: "/",
      ...(rememberMe ? { maxAge: 8 * 60 * 60 * 1000 } : {}),
    });
  }
  clearCookie(response: Response) {
    response.clearCookie(this.config.cookieName, {
      httpOnly: true,
      secure: this.config.secureCookies,
      sameSite: "lax",
      path: "/",
    });
  }
  async login(
    request: PortalRequest,
    username: string,
    password: string,
    response: Response,
    rememberMe = false,
  ) {
    this.requireOrigin(request);
    await this.throttle("ip:" + (request.ip ?? request.socket.remoteAddress ?? "unknown"), 60);
    await this.throttle("username:" + username, 10);
    const user = await this.database.client.user.findUnique({ where: { username } });
    const valid = await this.verify(user?.passwordHash ?? (await this.dummyHash), password);
    if (!valid || !user || user.status !== "active" || !user.passwordHash) {
      await this.authorization.audit(
        this.database.client,
        null,
        "auth.login_failed",
        null,
        request.requestId,
      );
      throw new UnauthorizedException();
    }
    const issued = await this.database.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${user.id}::uuid FOR UPDATE`;
      const latest = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (latest.status !== "active" || latest.credentialVersion !== user.credentialVersion)
        throw new UnauthorizedException();
      const previous = this.token(request);
      if (previous)
        await tx.session.updateMany({
          where: { tokenHash: secretHash(previous), revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await tx.loginThrottle.deleteMany({ where: { keyHash: secretHash("username:" + username) } });
      await this.authorization.audit(tx, user.id, "auth.login", user.id, request.requestId);
      return this.issue(tx, latest, rememberMe);
    });
    this.setCookie(response, issued.token, issued.session.rememberMe);
    return this.me({
      id: issued.session.id,
      csrfSecret: issued.session.csrfSecret,
      rememberMe: issued.session.rememberMe,
      user,
    });
  }
  async me(principal: SessionPrincipal) {
    const context = await this.authorization.context(principal.user.id);
    const memberships = await this.database.client.departmentMembership.findMany({
      where: { userId: principal.user.id, ...current(), department: { active: true } },
      select: {
        department: { select: { id: true, code: true, name: true } },
        membershipRole: true,
      },
    });
    const positions = await this.database.client.positionAssignment.findMany({
      where: { userId: principal.user.id, ...current() },
      select: { position: { select: { id: true, code: true, label: true } } },
    });
    const images = await this.database.client.userImage.findMany({
      where: { userId: principal.user.id },
      select: { kind: true, revision: true },
    });
    const storedProfile = await this.database.client.userProfile.findUnique({
      where: { userId: principal.user.id },
      select: {
        fullName: true,
        contactEmail: true,
        phone: true,
        address: true,
        headline: true,
        about: true,
        skills: true,
        website: true,
        github: true,
        linkedin: true,
        revision: true,
      },
    });
    const imageUrl = (kind: string) => {
      const row = images.find((image) => image.kind === kind);
      return row ? `/api/v1/me/images/${kind}?v=${row.revision}` : null;
    };
    return {
      user: {
        id: principal.user.id,
        username: principal.user.username,
        displayName: principal.user.displayName,
        mustChangePassword: principal.user.mustChangePassword,
        avatarUrl: imageUrl("avatar"),
        coverUrl: imageUrl("cover"),
        profile: accountProfileSchema.parse(storedProfile ?? {}),
      },
      csrfToken: principal.csrfSecret,
      capabilities: {
        manageUsers: context.admin,
        manageOrganization: context.admin,
        manageRoles: context.admin,
        viewAudit: context.admin,
      },
      memberships,
      positions: positions.map((x) => x.position),
      roles: context.roles.map((x) => ({ role: x.role, departmentId: x.departmentId })),
    };
  }
  async logout(principal: SessionPrincipal, response: Response, requestId: string) {
    await this.database.client.$transaction(async (tx) => {
      await tx.session.updateMany({ where: { id: principal.id }, data: { revokedAt: new Date() } });
      await this.authorization.audit(
        tx,
        principal.user.id,
        "auth.logout",
        principal.user.id,
        requestId,
      );
    });
    this.clearCookie(response);
    return { ok: true };
  }
  async changePassword(
    principal: SessionPrincipal,
    currentPassword: string,
    newPassword: string,
    response: Response,
    requestId: string,
  ) {
    const user = await this.database.client.user.findUniqueOrThrow({
      where: { id: principal.user.id },
    });
    if (!user.passwordHash || !(await this.verify(user.passwordHash, currentPassword)))
      throw new UnauthorizedException();
    if (newPassword === currentPassword || Buffer.byteLength(newPassword, "utf8") > 512)
      throw new BadRequestException();
    const encoded = await hashPassword(newPassword);
    const issued = await this.database.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${user.id}::uuid FOR UPDATE`;
      const latest = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (
        latest.status !== "active" ||
        latest.credentialVersion !== principal.user.credentialVersion
      )
        throw new ConflictException();
      const changed = await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: encoded,
          mustChangePassword: false,
          credentialVersion: { increment: 1 },
        },
      });
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.authorization.audit(tx, user.id, "auth.password_changed", user.id, requestId);
      return { ...(await this.issue(tx, changed, principal.rememberMe)), user: changed };
    });
    this.setCookie(response, issued.token, issued.session.rememberMe);
    return this.me({
      id: issued.session.id,
      csrfSecret: issued.session.csrfSecret,
      rememberMe: issued.session.rememberMe,
      user: issued.user,
    });
  }
}
