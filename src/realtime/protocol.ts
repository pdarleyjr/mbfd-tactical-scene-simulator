import { z } from "zod";

// Base messages schemas using Zod
export const JoinMessageSchema = z.object({
  type: z.literal("join"),
  roomCode: z.string().min(4).max(16),
  designation: z.string().min(1).max(16),
  isHost: z.boolean().default(false)
});

export const PresencePingMessageSchema = z.object({
  type: z.literal("presence_ping")
});

export const RequestSnapshotMessageSchema = z.object({
  type: z.literal("request_snapshot")
});

export const ScenarioCreateMessageSchema = z.object({
  type: z.literal("scenario_create"),
  scenarioId: z.string(),
  title: z.string()
});

export const ScenarioPatchMessageSchema = z.object({
  type: z.literal("scenario_patch"),
  patch: z.any()
});

export const ObjectAddMessageSchema = z.object({
  type: z.literal("object_add"),
  object: z.any()
});

export const ObjectUpdateMessageSchema = z.object({
  type: z.literal("object_update"),
  id: z.string(),
  update: z.any()
});

export const ObjectDeleteMessageSchema = z.object({
  type: z.literal("object_delete"),
  id: z.string()
});

export const HoseStartMessageSchema = z.object({
  type: z.literal("hose_start"),
  hose: z.any()
});

export const HoseUpdateMessageSchema = z.object({
  type: z.literal("hose_update"),
  id: z.string(),
  points: z.array(z.number())
});

export const HoseCompleteMessageSchema = z.object({
  type: z.literal("hose_complete"),
  id: z.string(),
  connectedFromObjectId: z.string().optional(),
  connectedToObjectId: z.string().optional(),
  label: z.string().optional()
});

export const BenchmarkMarkMessageSchema = z.object({
  type: z.literal("benchmark_mark"),
  name: z.string(),
  actor: z.string(),
  assignedUnit: z.string().optional(),
  note: z.string().optional()
});

export const TimerStartMessageSchema = z.object({ type: z.literal("timer_start") });
export const TimerPauseMessageSchema = z.object({ type: z.literal("timer_pause") });
export const TimerResumeMessageSchema = z.object({ type: z.literal("timer_resume") });
export const TimerResetMessageSchema = z.object({ type: z.literal("timer_reset") });

export const InjectRevealMessageSchema = z.object({
  type: z.literal("inject_reveal"),
  id: z.string()
});

export const TacticalUpdateMessageSchema = z.object({
  type: z.literal("tactical_update"),
  id: z.string(),
  update: z.any()
});

export const RadioReportSubmitMessageSchema = z.object({
  type: z.literal("radio_report_submit"),
  report: z.any()
});

export const TacticalPlanSubmitMessageSchema = z.object({
  type: z.literal("tactical_plan_submit"),
  plan: z.any()
});

// Union client-to-server message schema
export const ClientMessageSchema = z.discriminatedUnion("type", [
  JoinMessageSchema,
  PresencePingMessageSchema,
  RequestSnapshotMessageSchema,
  ScenarioCreateMessageSchema,
  ScenarioPatchMessageSchema,
  ObjectAddMessageSchema,
  ObjectUpdateMessageSchema,
  ObjectDeleteMessageSchema,
  HoseStartMessageSchema,
  HoseUpdateMessageSchema,
  HoseCompleteMessageSchema,
  BenchmarkMarkMessageSchema,
  TimerStartMessageSchema,
  TimerPauseMessageSchema,
  TimerResumeMessageSchema,
  TimerResetMessageSchema,
  InjectRevealMessageSchema,
  TacticalUpdateMessageSchema,
  RadioReportSubmitMessageSchema,
  TacticalPlanSubmitMessageSchema
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// Server to client messages definitions
export type ServerMessageType =
  | "joined_ack"
  | "room_snapshot"
  | "roster_update"
  | "scenario_patch_broadcast"
  | "object_broadcast"
  | "hose_broadcast"
  | "benchmark_broadcast"
  | "timer_broadcast"
  | "inject_broadcast"
  | "tactical_broadcast"
  | "timeline_broadcast"
  | "error"
  | "reconnect_required";

export interface ServerMessage {
  type: ServerMessageType;
  payload: any;
}
