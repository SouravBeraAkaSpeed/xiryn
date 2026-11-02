import { relations } from "drizzle-orm"
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core"
import { createInsertSchema } from "drizzle-zod"
import { nanoid } from "nanoid"
import { z } from "zod"

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => nanoid(12))

const timestamp = () =>
  integer({ mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())

/* ───────────────────────────── agents ───────────────────────────── */

export const agents = sqliteTable("agents", {
  id: id(),
  name: text().notNull(),
  // One line describing what the agent is for
  role: text().notNull(),
  // Standing orders appended to the agent's system prompt
  instructions: text(),
  // "provider/model". Null falls back to the workspace default.
  model: text(),
  // Seed for the agent's generated glyph
  glyph: text()
    .notNull()
    .$defaultFn(() => nanoid(10)),
  // Docker container backing the agent's workstation. Created on first use.
  workstationId: text(),
  createdAt: timestamp(),
  updatedAt: timestamp(),
})

/* ───────────────────────────── squads ───────────────────────────── */

export const squads = sqliteTable("squads", {
  id: id(),
  name: text().notNull(),
  createdAt: timestamp(),
})

export const squadMembers = sqliteTable(
  "squad_members",
  {
    squadId: text()
      .notNull()
      .references(() => squads.id, { onDelete: "cascade" }),
    agentId: text()
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    position: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.squadId, t.agentId] }),
    index("squad_members_agent_idx").on(t.agentId),
  ]
)

/* ───────────────────────────── threads ──────────────────────────── */

// A conversation with one agent (agentId) or with a squad (squadId)
export const threads = sqliteTable(
  "threads",
  {
    id: id(),
    agentId: text().references(() => agents.id, { onDelete: "cascade" }),
    squadId: text().references(() => squads.id, { onDelete: "cascade" }),
    title: text(),
    preview: text(),
    activeAt: timestamp(),
    createdAt: timestamp(),
  },
  (t) => [
    index("threads_agent_idx").on(t.agentId, t.activeAt),
    index("threads_squad_idx").on(t.squadId, t.activeAt),
    index("threads_active_idx").on(t.activeAt),
  ]
)

export const messages = sqliteTable(
  "messages",
  {
    // UI message id, assigned by the client (user) or the stream (assistant)
    id: text().primaryKey(),
    threadId: text()
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    role: text({ enum: ["user", "assistant", "system"] }).notNull(),
    parts: text({ mode: "json" }).notNull().$type<unknown[]>(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: timestamp(),
  },
  (t) => [index("messages_thread_idx").on(t.threadId, t.createdAt)]
)

/* ───────────────────────────── memory ───────────────────────────── */

// Long-term notes an agent keeps about the person and their work. Shared
// across every thread the agent takes part in.
export const memories = sqliteTable(
  "memories",
  {
    id: id(),
    agentId: text()
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    content: text().notNull(),
    createdAt: timestamp(),
  },
  (t) => [index("memories_agent_idx").on(t.agentId, t.createdAt)]
)

/* ───────────────────────────── ledger ───────────────────────────── */

// One row per agent turn: what it ran on, what it consumed, how it ended
export const turns = sqliteTable(
  "turns",
  {
    id: id(),
    threadId: text().references(() => threads.id, { onDelete: "set null" }),
    agentId: text().references(() => agents.id, { onDelete: "set null" }),
    model: text().notNull(),
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    reasoningTokens: integer().notNull().default(0),
    cachedTokens: integer().notNull().default(0),
    steps: integer().notNull().default(0),
    toolCalls: integer().notNull().default(0),
    durationMs: integer().notNull().default(0),
    // What the turn cost in millionths of a dollar, priced when it ran. Zero
    // on local models; null when the model's price isn't known.
    costMicros: integer(),
    status: text({ enum: ["completed", "stopped", "failed"] }).notNull(),
    error: text(),
    createdAt: timestamp(),
  },
  (t) => [index("turns_created_idx").on(t.createdAt)]
)

/* ──────────────────────────── routines ──────────────────────────── */

// When a routine runs, in this computer's local time
export type RoutineSchedule =
  | { kind: "daily" | "weekdays"; time: string }
  | { kind: "weekly"; time: string; day: number }
  | { kind: "hourly"; every: number }
  // Just once, at a local date and time like "2026-10-21T09:00"
  | { kind: "once"; at: string }

// A task an agent (or a squad) does on its own on a schedule, e.g. a news
// brief every morning. Each routine posts into its own thread.
export const routines = sqliteTable(
  "routines",
  {
    id: id(),
    name: text().notNull(),
    agentId: text().references(() => agents.id, { onDelete: "cascade" }),
    squadId: text().references(() => squads.id, { onDelete: "cascade" }),
    prompt: text().notNull(),
    schedule: text({ mode: "json" }).notNull().$type<RoutineSchedule>(),
    enabled: integer({ mode: "boolean" }).notNull().default(true),
    threadId: text().references(() => threads.id, { onDelete: "set null" }),
    nextRunAt: integer({ mode: "timestamp_ms" }),
    lastRunAt: integer({ mode: "timestamp_ms" }),
    lastStatus: text({ enum: ["running", "ok", "failed", "stopped", "skipped"] }),
    lastError: text(),
    createdAt: timestamp(),
  },
  (t) => [index("routines_next_idx").on(t.enabled, t.nextRunAt)]
)

// Every time a routine came due or was run by hand, including the times it
// was skipped. What a run cost is in the ledger: the turn it started.
export const routineRuns = sqliteTable(
  "routine_runs",
  {
    id: id(),
    routineId: text()
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    trigger: text({ enum: ["schedule", "manual"] }).notNull(),
    status: text({ enum: ["running", "ok", "failed", "stopped", "skipped"] }).notNull(),
    // Why it was skipped, or what went wrong
    detail: text(),
    // When it was due; null for a run by hand
    dueAt: integer({ mode: "timestamp_ms" }),
    threadId: text().references(() => threads.id, { onDelete: "set null" }),
    turnId: text().references(() => turns.id, { onDelete: "set null" }),
    startedAt: timestamp(),
    finishedAt: integer({ mode: "timestamp_ms" }),
  },
  (t) => [index("routine_runs_routine_idx").on(t.routineId, t.startedAt)]
)

/* ───────────────────────────── vault ────────────────────────────── */

// Logins, cards, UPI IDs and personal details, encrypted with a key held by
// the operating system's keychain (lib/vault.ts). Agents only ever see the
// label and the hint; the values are typed into pages by Xiryn itself.
export const vaultItems = sqliteTable(
  "vault_items",
  {
    id: id(),
    kind: text({ enum: ["card", "upi", "login", "identity", "code"] }).notNull(),
    label: text().notNull(),
    // Safe to show anyone, agents included: "Visa ···· 4242 · 08/29"
    hint: text().notNull(),
    // A login only fills on this site and its subdomains
    site: text(),
    // AES-256-GCM: base64 of iv, tag and ciphertext
    secret: text().notNull(),
    // One-time entries (a code, a card used once) are removed after use
    ephemeral: integer({ mode: "boolean" }).notNull().default(false),
    lastUsedAt: integer({ mode: "timestamp_ms" }),
    createdAt: timestamp(),
    updatedAt: timestamp(),
  },
  (t) => [index("vault_items_kind_idx").on(t.kind)]
)

// A payment an agent asked to make, and what the person decided
export const vaultApprovals = sqliteTable(
  "vault_approvals",
  {
    id: id(),
    threadId: text()
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    // The agent that asked, whose desktop has the checkout open
    agentId: text().references(() => agents.id, { onDelete: "cascade" }),
    // The saved card or UPI ID the person chose
    itemId: text().references(() => vaultItems.id, { onDelete: "cascade" }),
    merchant: text().notNull(),
    amount: text().notNull(),
    purpose: text(),
    // The site the checkout was on when the agent asked; payment details only
    // fill there
    host: text(),
    status: text({ enum: ["pending", "approved", "declined", "taken-over"] })
      .notNull()
      .default("pending"),
    createdAt: timestamp(),
    decidedAt: integer({ mode: "timestamp_ms" }),
    expiresAt: integer({ mode: "timestamp_ms" }),
  },
  (t) => [index("vault_approvals_thread_idx").on(t.threadId)]
)

/* ──────────────────────────── settings ──────────────────────────── */

// Values saved from the Settings screen. They take precedence over .env.
export const settings = sqliteTable("settings", {
  key: text().primaryKey(),
  value: text().notNull(),
  updatedAt: timestamp(),
})

/* ──────────────────────────── machines ──────────────────────────── */

// How big each agent's computer is: processors, memory and screen. No row:
// the workspace defaults from Settings. A change applies the next time the
// machine starts; its home folder is kept.
export const agentMachines = sqliteTable("agent_machines", {
  agentId: text()
    .primaryKey()
    .references(() => agents.id, { onDelete: "cascade" }),
  cpus: real().notNull(),
  memoryGb: real().notNull(),
  screenWidth: integer().notNull(),
  screenHeight: integer().notNull(),
  updatedAt: timestamp(),
})

/* ──────────────────────────── relations ─────────────────────────── */

export const agentsRelations = relations(agents, ({ many }) => ({
  squads: many(squadMembers),
  threads: many(threads),
  memories: many(memories),
}))

export const squadsRelations = relations(squads, ({ many }) => ({
  members: many(squadMembers),
  threads: many(threads),
}))

export const squadMembersRelations = relations(squadMembers, ({ one }) => ({
  squad: one(squads, { fields: [squadMembers.squadId], references: [squads.id] }),
  agent: one(agents, { fields: [squadMembers.agentId], references: [agents.id] }),
}))

export const threadsRelations = relations(threads, ({ one, many }) => ({
  agent: one(agents, { fields: [threads.agentId], references: [agents.id] }),
  squad: one(squads, { fields: [threads.squadId], references: [squads.id] }),
  messages: many(messages),
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  thread: one(threads, { fields: [messages.threadId], references: [threads.id] }),
}))

export const memoriesRelations = relations(memories, ({ one }) => ({
  agent: one(agents, { fields: [memories.agentId], references: [agents.id] }),
}))

/* ──────────────────────────── validation ────────────────────────── */

// "provider/model-id", e.g. "openai/gpt-6-luna" or "ollama/qwen3:8b"
export const modelSpecSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]+\/\S+$/, "Use the form provider/model, e.g. openai/gpt-6-luna.")

export const agentInputSchema = createInsertSchema(agents, {
  name: (s) =>
    s.trim().min(1, "Give the agent a name.").max(40, "Keep it under 40 characters."),
  role: (s) =>
    s
      .trim()
      .min(1, "Describe what the agent is for.")
      .max(120, "Keep it under 120 characters."),
  instructions: (s) => s.trim().max(6000, "Keep it under 6000 characters."),
  model: () => z.union([modelSpecSchema, z.literal("")]),
}).omit({ id: true, workstationId: true, createdAt: true, updatedAt: true })

export const squadInputSchema = createInsertSchema(squads, {
  name: (s) => s.trim().min(1, "Name the squad.").max(40, "Keep it under 40 characters."),
})
  .omit({ id: true, createdAt: true })
  .extend({
    agentIds: z.array(z.string()).min(2, "A squad needs at least two agents."),
  })

// US dollars per million tokens, for a model Xiryn has no price for
export const modelPriceSchema = z.object({
  spec: modelSpecSchema,
  input: z.number().min(0, "Prices can't be negative.").max(10_000),
  output: z.number().min(0, "Prices can't be negative.").max(10_000),
  cached: z.number().min(0).max(10_000).optional(),
})

// Dollars a month; empty or 0 means no budget
export const monthlyBudgetSchema = z
  .string()
  .trim()
  .regex(/^(\d{1,6}(\.\d{1,2})?)?$/, "Use a dollar amount, e.g. 20 or 7.50.")

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 08:30.")

export const routineScheduleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["daily", "weekdays"]), time: clock }),
  z.object({
    kind: z.literal("weekly"),
    time: clock,
    day: z.number().int().min(0).max(6),
  }),
  z.object({ kind: z.literal("hourly"), every: z.number().int().min(1).max(24) }),
  z.object({
    kind: z.literal("once"),
    at: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/,
        "Use a date and time like 2026-10-21T09:00."
      ),
  }),
])

export const routineInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name the routine.")
      .max(60, "Keep it under 60 characters."),
    agentId: z.string().nullish(),
    squadId: z.string().nullish(),
    prompt: z
      .string()
      .trim()
      .min(1, "Say what to do each time.")
      .max(4000, "Keep it under 4000 characters."),
    schedule: routineScheduleSchema,
    enabled: z.boolean().default(true),
  })
  .refine((value) => !!value.agentId !== !!value.squadId, {
    message: "Pick one agent or one squad.",
    path: ["agentId"],
  })

export const memoryInputSchema = z.object({
  content: z.string().trim().min(1, "Write something to remember.").max(2000),
})

export type Agent = typeof agents.$inferSelect
export type AgentInput = z.infer<typeof agentInputSchema>
export type Squad = typeof squads.$inferSelect
export type SquadInput = z.infer<typeof squadInputSchema>
export type Thread = typeof threads.$inferSelect
export type Memory = typeof memories.$inferSelect
export type Turn = typeof turns.$inferSelect
export type Routine = typeof routines.$inferSelect
export type RoutineRun = typeof routineRuns.$inferSelect
export type RoutineInput = z.infer<typeof routineInputSchema>
export type MessageRow = typeof messages.$inferSelect
