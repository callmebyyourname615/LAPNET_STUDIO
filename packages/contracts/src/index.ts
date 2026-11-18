import { z } from "zod";

export const versionSchema = z.object({
  application: z.literal("lapnet-studio-portal"),
  version: z.string(),
  revision: z.string(),
  timestamp: z.iso.datetime(),
});
export type VersionResponse = z.infer<typeof versionSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.uuid(),
    timestamp: z.iso.datetime(),
  }),
});
export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;

export const paginationSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z
      .string()
      .max(200)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .strict();
export type Pagination = z.infer<typeof paginationSchema>;
export type Page<T> = { items: T[]; nextCursor: string | null };

const profileLink = z.union([
  z.literal(""),
  z
    .url()
    .max(500)
    .refine((value) => {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
    }),
]);
export const accountProfileSchema = z
  .object({
    fullName: z.string().trim().max(200).default(""),
    contactEmail: z.union([z.literal(""), z.email().max(254)]).default(""),
    phone: z.string().trim().max(40).default(""),
    address: z.string().trim().max(500).default(""),
    headline: z.string().trim().max(120).default(""),
    about: z.string().trim().max(2000).default(""),
    skills: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    website: profileLink.default(""),
    github: profileLink.default(""),
    linkedin: profileLink.default(""),
    revision: z.number().int().nonnegative().default(0),
  })
  .strict();
export const accountProfileUpdateSchema = accountProfileSchema
  .extend({ displayName: z.string().trim().min(1).max(120) })
  .strict();
export const accountImageLimits = {
  maxBytes: 8 * 1024 * 1024,
  allowedTypes: ["image/jpeg", "image/png", "image/webp"],
} as const;
export const meSchema = z.object({
  user: z.object({
    id: z.uuid(),
    username: z.string().nullable(),
    displayName: z.string(),
    mustChangePassword: z.boolean(),
    avatarUrl: z.string().nullable().default(null),
    coverUrl: z.string().nullable().default(null),
    profile: accountProfileSchema.default({
      fullName: "",
      contactEmail: "",
      phone: "",
      address: "",
      headline: "",
      about: "",
      skills: [],
      website: "",
      github: "",
      linkedin: "",
      revision: 0,
    }),
  }),
  csrfToken: z.string().min(32).max(100),
  capabilities: z.object({
    manageUsers: z.boolean(),
    manageOrganization: z.boolean(),
    manageRoles: z.boolean(),
    viewAudit: z.boolean(),
  }),
  memberships: z.array(
    z.object({
      department: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
      membershipRole: z.string(),
    }),
  ),
  positions: z.array(z.object({ id: z.uuid(), code: z.string(), label: z.string() })),
  roles: z.array(
    z.object({
      role: z.enum(["portal_admin", "resource_viewer", "resource_editor"]),
      departmentId: z.uuid().nullable(),
    }),
  ),
});
export type MeResponse = z.infer<typeof meSchema>;

export const taskStatuses = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
export const taskPriorities = ["low", "normal", "high", "urgent"] as const;
export type TaskStatus = (typeof taskStatuses)[number];
export type TaskPriority = (typeof taskPriorities)[number];
export const taskPersonSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  status: z.enum(["active", "disabled"]),
});
export const taskSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(taskStatuses),
  priority: z.enum(taskPriorities),
  dueDate: z.string().nullable(),
  overdue: z.boolean(),
  revision: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  owner: taskPersonSchema,
  department: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
  assignee: taskPersonSchema,
  assignedBy: taskPersonSchema,
  collaborators: z.array(taskPersonSchema),
  permissions: z.object({ view: z.boolean(), edit: z.boolean(), manageAccess: z.boolean() }),
});
export type TaskRecord = z.infer<typeof taskSchema>;
export const taskPageSchema = z.object({
  items: z.array(taskSchema),
  total: z.number().int(),
  nextCursor: z.string().nullable(),
});
export type TaskPage = z.infer<typeof taskPageSchema>;
export const taskOptionsSchema = z.object({
  departments: z.array(z.object({ id: z.uuid(), code: z.string(), name: z.string() })),
  users: z.array(taskPersonSchema),
});
export type TaskOptions = z.infer<typeof taskOptionsSchema>;
export const taskHistorySchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      revision: z.number().int(),
      action: z.string(),
      reason: z.string().nullable(),
      occurredAt: z.string(),
      actor: taskPersonSchema,
      snapshot: z.object({
        title: z.string(),
        description: z.string(),
        status: z.enum(taskStatuses),
        priority: z.enum(taskPriorities),
        dueDate: z.string().nullable(),
        assignee: taskPersonSchema,
        collaborators: z.array(taskPersonSchema),
        archived: z.boolean(),
      }),
    }),
  ),
  nextBefore: z.number().int().nullable(),
});
export type TaskHistory = z.infer<typeof taskHistorySchema>;
export type TaskWrite = {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string | null;
  assigneeId: string;
  collaboratorIds: string[];
  shareParticipants: boolean;
};

export const taskDepartmentsSchema = z.array(
  z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
);

export const dashboardSchema = z.object({
  asOf: z.string(),
  days: z.number().int(),
  view: z.enum(["mine", "all"]),
  totals: z.object({
    total: z.number().int(),
    active: z.number().int(),
    dueToday: z.number().int(),
    overdue: z.number().int(),
    completed: z.number().int(),
  }),
  statuses: z.array(z.object({ status: z.enum(taskStatuses), count: z.number().int() })),
  priorities: z.array(z.object({ priority: z.enum(taskPriorities), count: z.number().int() })),
  trend: z.array(
    z.object({ date: z.string(), created: z.number().int(), completed: z.number().int() }),
  ),
  upcoming: z.array(taskSchema),
  recent: z.array(taskSchema),
});
export type DashboardSummary = z.infer<typeof dashboardSchema>;

export const businessKinds = ["post", "company", "interaction", "document"] as const;
export type BusinessKind = (typeof businessKinds)[number];
export const businessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const d = new Date(value + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
  });
export const companyDataSchema = z
  .object({
    legalName: z.string().max(200).default(""),
    registrationNumber: z.string().max(100).default(""),
    category: z.string().max(100).default(""),
    notes: z.string().max(8000).default(""),
  })
  .strict();
export const postDataSchema = z.object({ text: z.string().trim().min(1).max(10000) }).strict();
export const interactionDataSchema = z
  .object({
    companyId: z.uuid(),
    type: z.enum(["visit", "meeting", "call", "correspondence", "other"]),
    occurredOn: businessDateSchema,
    occurredAt: z.iso.datetime({ offset: true }).nullable().default(null),
    discussion: z.string().max(10000).default(""),
    decisions: z.string().max(8000).default(""),
    nextSteps: z.string().max(8000).default(""),
    internalAttendees: z.array(z.uuid()).max(50).default([]),
    externalAttendees: z.array(z.string().max(150)).max(50).default([]),
  })
  .strict();
export const documentDataSchema = z
  .object({
    direction: z.enum(["incoming", "outgoing", "internal"]),
    externalNumber: z.string().max(200).default(""),
    issueDate: businessDateSchema.nullable().default(null),
    description: z.string().max(8000).default(""),
    tags: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  })
  .strict();

export const documentRegistrationSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    departmentId: z.uuid(),
    folderId: z.uuid().nullable().default(null),
    registryNumber: z.string().trim().min(1).max(100).nullable().default(null),
    companyId: z.uuid().nullable().default(null),
    data: documentDataSchema,
    movement: z
      .object({
        occurredOn: businessDateSchema,
        counterpartyName: z.string().trim().min(1).max(200),
        reference: z.string().max(200).default(""),
        note: z.string().max(2000).default(""),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.data.direction === "internal" && value.movement)
      ctx.addIssue({ code: "custom", message: "Internal document has no external movement" });
    if (value.movement && value.data.issueDate && value.movement.occurredOn < value.data.issueDate)
      ctx.addIssue({ code: "custom", message: "Movement predates issue date" });
  });
export type DocumentRegistration = z.infer<typeof documentRegistrationSchema>;
export const documentUploadLimits = {
  maxFileBytes: 25 * 1024 * 1024,
  allowedExtensions: [
    "pdf",
    "docx",
    "xlsx",
    "pptx",
    "jpg",
    "jpeg",
    "png",
    "webp",
    "txt",
    "csv",
    "zip",
  ],
} as const;

export const documentFolderInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    departmentId: z.uuid(),
    parentId: z.uuid().nullable().default(null),
  })
  .strict();
export const documentFolderUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    parentId: z.uuid().nullable().optional(),
    revision: z.number().int().positive(),
  })
  .strict();
export const documentFolderDeleteSchema = z
  .object({
    revision: z.number().int().positive(),
    confirmationName: z.string().min(1).max(120),
  })
  .strict();
export const documentUpdateSchema = z
  .object({
    revision: z.number().int().positive(),
    title: z.string().trim().min(1).max(200).optional(),
    folderId: z.uuid().nullable().optional(),
    registryNumber: z.string().trim().min(1).max(100).nullable().optional(),
    companyId: z.uuid().nullable().optional(),
    data: documentDataSchema.optional(),
  })
  .strict();
export const recordSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  kind: z.enum(businessKinds),
  title: z.string(),
  data: z.record(z.string(), z.unknown()),
  revision: z.number().int(),
  parentId: z.uuid().nullable(),
  occurredOn: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  owner: taskPersonSchema,
  department: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
  permissions: z.object({
    view: z.boolean(),
    edit: z.boolean(),
    comment: z.boolean(),
    manageAccess: z.boolean(),
    download: z.boolean(),
  }),
});
export type PortalRecord = z.infer<typeof recordSchema>;
export const recordPageSchema = z.object({
  items: z.array(recordSchema),
  total: z.number().int(),
  nextCursor: z.string().nullable(),
});
export const commentSchema = z.object({
  id: z.uuid(),
  text: z.string(),
  revision: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  author: taskPersonSchema,
  canEdit: z.boolean(),
});
export const commentsSchema = z.object({
  items: z.array(commentSchema),
  nextCursor: z.string().nullable(),
});
export const versionsSchema = z.array(
  z.object({
    id: z.uuid(),
    number: z.number().int(),
    filename: z.string(),
    mime: z.string(),
    bytes: z.number().int(),
    sha256: z.string(),
    state: z.string(),
    scanError: z.string().nullable(),
    createdAt: z.string(),
    uploadedById: z.uuid().nullable().optional(),
    note: z.string().optional(),
  }),
);
export const documentWorkspaceConfigSchema = z.object({
  userId: z.uuid(),
  departments: z.array(
    z.object({ id: z.uuid(), name: z.string(), code: z.string(), canCreate: z.boolean() }),
  ),
  users: z.array(taskPersonSchema),
  companies: z.array(z.object({ id: z.uuid(), title: z.string() })),
  folders: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      parentId: z.uuid().nullable(),
      departmentId: z.uuid(),
      createdById: z.uuid(),
      revision: z.number().int(),
      canManage: z.boolean(),
    }),
  ),
  tags: z.array(z.object({ id: z.string(), name: z.string() })),
  storage: z.object({ usedBytes: z.number().int() }),
  limits: z.object({ maxFileBytes: z.number().int(), allowedExtensions: z.array(z.string()) }),
});
const documentMovementSchema = z.object({
  id: z.uuid(),
  documentId: z.uuid(),
  direction: z.enum(["incoming", "outgoing"]),
  occurredOn: z.string(),
  counterpartyId: z.uuid().nullable(),
  counterpartyName: z.string(),
  reference: z.string(),
  note: z.string(),
  createdAt: z.string(),
});
export const workspaceDocumentSchema = recordSchema.extend({
  data: documentDataSchema,
  folderId: z.uuid().nullable(),
  registryNumber: z.string().nullable(),
  companyId: z.uuid().nullable(),
  versions: versionsSchema,
  movements: z.array(documentMovementSchema).default([]),
});
export const workspaceDocumentPageSchema = z.object({
  items: z.array(workspaceDocumentSchema),
  total: z.number().int(),
  nextCursor: z.string().nullable(),
});
export const workspaceDocumentDetailSchema = workspaceDocumentSchema.extend({
  links: z.array(
    z.object({
      linkId: z.uuid(),
      id: z.uuid(),
      kind: z.string(),
      title: z.string(),
      href: z.string(),
    }),
  ),
  grants: z.array(
    z.object({
      id: z.uuid(),
      userId: z.uuid().nullable(),
      departmentId: z.uuid().nullable(),
      permission: z.enum(["view", "comment", "edit", "download", "manage_access"]),
    }),
  ),
  history: z.array(
    z.object({
      id: z.uuid(),
      revision: z.number().int(),
      actorId: z.uuid(),
      occurredAt: z.string(),
      action: z.string(),
    }),
  ),
});
export type WorkspaceDocument = z.infer<typeof workspaceDocumentSchema>;
export type WorkspaceDocumentDetail = z.infer<typeof workspaceDocumentDetailSchema>;
export type DocumentWorkspaceConfig = z.infer<typeof documentWorkspaceConfigSchema>;
export const contactsSchema = z.array(
  z.object({
    id: z.uuid(),
    displayName: z.string(),
    position: z.string(),
    email: z.string().nullable(),
    phone: z.string(),
    active: z.boolean(),
    revision: z.number().int(),
  }),
);
export const movementsSchema = z.array(
  z.object({
    id: z.uuid(),
    direction: z.string(),
    occurredOn: z.string(),
    counterpartyId: z.uuid().nullable(),
    reference: z.string(),
    note: z.string(),
    createdAt: z.string(),
  }),
);
export const notificationsSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      kind: z.string(),
      title: z.string(),
      href: z.string(),
      readAt: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
  unread: z.number().int(),
  nextCursor: z.string().nullable(),
});
export const searchSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      kind: z.string(),
      title: z.string(),
      code: z.string(),
      href: z.string(),
    }),
  ),
  total: z.number().int(),
  nextCursor: z.string().nullable(),
});
export const timelineSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      occurredOn: z.string(),
      recordedAt: z.string(),
      href: z.string(),
      summary: z.string(),
    }),
  ),
  total: z.number().int(),
  nextCursor: z.string().nullable(),
});
