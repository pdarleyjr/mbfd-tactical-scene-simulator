import type { ApparatusKind } from "@/types/scenario";

export interface ApparatusTemplate {
  id: string;
  designation: string;
  kind: ApparatusKind;
  width: number;
  height: number;
  label: string;
}

export const apparatusTemplates: ApparatusTemplate[] = [
  // Engines
  { id: "tmpl-e1", designation: "E1", kind: "engine", width: 100, height: 40, label: "Engine 1" },
  { id: "tmpl-e2", designation: "E2", kind: "engine", width: 100, height: 40, label: "Engine 2" },
  { id: "tmpl-e3", designation: "E3", kind: "engine", width: 100, height: 40, label: "Engine 3" },
  { id: "tmpl-e4", designation: "E4", kind: "engine", width: 100, height: 40, label: "Engine 4" },
  
  // Ladder Trucks
  { id: "tmpl-l1", designation: "L1", kind: "ladder", width: 130, height: 42, label: "Ladder 1" },
  { id: "tmpl-l3", designation: "L3", kind: "ladder", width: 130, height: 42, label: "Ladder 3" },
  
  // Rescues
  { id: "tmpl-r1", designation: "R1", kind: "rescue", width: 90, height: 38, label: "Rescue 1" },
  { id: "tmpl-r11", designation: "R11", kind: "rescue", width: 90, height: 38, label: "Rescue 11" },
  { id: "tmpl-r2", designation: "R2", kind: "rescue", width: 90, height: 38, label: "Rescue 2" },
  { id: "tmpl-r22", designation: "R22", kind: "rescue", width: 90, height: 38, label: "Rescue 22" },
  { id: "tmpl-r3", designation: "R3", kind: "rescue", width: 90, height: 38, label: "Rescue 3" },
  { id: "tmpl-r4", designation: "R4", kind: "rescue", width: 90, height: 38, label: "Rescue 4" },
  { id: "tmpl-r44", designation: "R44", kind: "rescue", width: 90, height: 38, label: "Rescue 44" },
  
  // Command / Safety SUVs
  { id: "tmpl-300", designation: "300", kind: "command_suv", width: 70, height: 34, label: "Command 300" },
  { id: "tmpl-capt5", designation: "Capt. 5", kind: "safety_suv", width: 70, height: 34, label: "Capt. 5 (Safety)" }
];
