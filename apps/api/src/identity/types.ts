export type SessionPrincipal = {
  id: string;
  csrfSecret: string;
  rememberMe: boolean;
  user: {
    id: string;
    username: string | null;
    displayName: string;
    status: "active" | "disabled";
    mustChangePassword: boolean;
    credentialVersion: number;
  };
};
