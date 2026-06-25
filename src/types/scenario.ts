export type ApparatusKind = 'engine' | 'ladder' | 'rescue' | 'command_suv' | 'safety_suv';

export interface FireCondition {
  intensity: 'none' | 'light' | 'moderate' | 'heavy' | 'fully_involved';
  location: string;
}

export interface SmokeCondition {
  level: 'none' | 'light' | 'moderate' | 'heavy' | 'black_turbulent';
  location: string;
}

export interface ApparatusObject {
  id: string;
  type: 'apparatus';
  apparatusKind: ApparatusKind;
  designation: string;
  status: 'staging' | 'deployed' | 'moving';
  assignedUserDesignation?: string;
  placedAt?: string;
  lastMovedAt?: string;
  label?: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  locked: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface HydrantObject {
  id: string;
  type: 'hydrant';
  label: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  locked: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BuildingObject {
  id: string;
  type: 'building';
  label: string;
  footprint: { x: number; y: number; width: number; height: number };
  floors: number;
  occupancyType: string;
  constructionType: string;
  selectedAsIncidentBuilding: boolean;
  fireCondition: FireCondition;
  smokeCondition: SmokeCondition;
  notes: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  locked: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioObject {
  id: string;
  type: 'apparatus' | 'hydrant' | 'building' | 'hazard' | 'wind' | 'label';
  label: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  locked: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  metadata?: any;
}

export type HoseType = 'supply5' | 'hose3' | 'attack175';
export type HoseColor = 'yellow' | 'gray' | 'green';

export interface HoseLine {
  id: string;
  hoseType: HoseType;
  color: HoseColor;
  points: number[]; // Flat array of [x1, y1, x2, y2, ...]
  createdBy: string;
  startedAt: string;
  completedAt?: string;
  connectedFromObjectId?: string;
  connectedToObjectId?: string;
  label: string;
  isDrawing?: boolean;
}

export type TacticalStatus = 'Not Started' | 'Assigned' | 'In Progress' | 'Complete';

export interface TacticalConsideration {
  id: string;
  category: string;
  status: TacticalStatus;
  assignedUnit: string;
  notes: string;
  updatedAt: string;
}

export interface TimelineEvent {
  id: string;
  type: string;
  description: string;
  elapsedSeconds: number; // relative to scenario start
  absoluteTimestamp: string;
  actor: string;
  metadata?: any;
}

export interface RoomRosterEntry {
  clientId: string;
  designation: string;
  role: 'Host/Instructor' | 'Participant';
  connectionState: 'online' | 'offline' | 'reconnecting';
  lastActionTimestamp: string;
}

export interface TimerState {
  startedAt: string | null; // absolute timestamp
  pausedAt: string | null;  // absolute timestamp
  accumulatedSeconds: number;
  isRunning: boolean;
}

export interface Inject {
  id: string;
  title: string;
  description: string;
  revealed: boolean;
  revealedAt?: string;
  effect?: any; // Action on map
}

export interface RadioReport {
  id: string;
  submittedAt: string;
  actor: string;
  buildingType: string;
  conditionsShowing: string;
  occupancy: string;
  action: string;
  waterSupply: string;
  commandName: string;
  strategy: 'Offensive' | 'Defensive' | 'Transitional';
  fullReport: string;
}

export interface TacticalPlan {
  id: string;
  submittedAt: string;
  actor: string;
  strategy: string;
  firstLinePlacement: string;
  backupLine: string;
  searchPlan: string;
  ventPlan: string;
  truckPlacementRationale: string;
  waterSupplyPlan: string;
  assignmentsNextUnits: string;
  safetyConcerns: string;
}

export interface ScenarioDefinition {
  id: string;
  title: string;
  description: string;
  buildings: BuildingObject[];
  hydrants: HydrantObject[];
  injects: Inject[];
  tacticalObjectives: { category: string; description: string }[];
  instructorNotes?: string;
}

export interface ScenarioRun {
  roomCode: string;
  scenarioId: string;
  scenarioTitle: string;
  hostClientId?: string;
  objects: Record<string, ScenarioObject | ApparatusObject | HydrantObject | BuildingObject>;
  hoses: Record<string, HoseLine>;
  tacticalConsiderations: Record<string, TacticalConsideration>;
  timer: TimerState;
  timeline: TimelineEvent[];
  radioReports: RadioReport[];
  tacticalPlans: TacticalPlan[];
  roster: Record<string, RoomRosterEntry>;
}
