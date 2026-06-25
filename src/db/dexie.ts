import Dexie, { type Table } from 'dexie';
import type { ScenarioDefinition, ScenarioRun, TimelineEvent } from '@/types/scenario';

export class TacticalDb extends Dexie {
  scenarios!: Table<ScenarioDefinition, string>;
  scenarioRuns!: Table<ScenarioRun & { id?: string }, string>;
  localEvents!: Table<TimelineEvent & { id?: string }, string>;
  userPreferences!: Table<{ key: string; value: any }, string>;
  exports!: Table<{ id: string; name: string; format: string; data: string; timestamp: string }, string>;

  constructor() {
    super('MbfdTacticalDb');
    this.version(1).stores({
      scenarios: 'id, title',
      scenarioRuns: 'roomCode, scenarioId',
      localEvents: 'id, type, actor, elapsedSeconds',
      userPreferences: 'key',
      exports: 'id, name, format, timestamp'
    });
  }
}

export const db = new TacticalDb();
