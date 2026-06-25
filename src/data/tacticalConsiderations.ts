export interface TacticTemplate {
  category: string;
  options?: string[];
  description: string;
}

export const defaultTacticalConsiderations: TacticTemplate[] = [
  {
    category: "Command",
    description: "Establish Command, perform size-up, and make early tactical declarations."
  },
  {
    category: "Water Supply",
    description: "Secure reliable continuous supply from hydrant, reverse lay, or drafting."
  },
  {
    category: "Fire Attack",
    options: ["Jump-line evolution", "SKID-LOAD", "High-rise evolution", "Portable standpipe"],
    description: "Deploy appropriate attack lines and nozzle flows to control primary body of fire."
  },
  {
    category: "Search / Rescue",
    description: "Primary and secondary search of fire building and exposures for life safety."
  },
  {
    category: "VENT",
    description: "Coordinate ventilation (vertical, horizontal, mechanical, PPV) with fire attack."
  },
  {
    category: "RIT",
    description: "Establish Rapid Intervention Team (RIT) at entry points with necessary tools."
  },
  {
    category: "Utilities",
    description: "Secure gas and local power meters."
  },
  {
    category: "FPL",
    description: "Notify Florida Power & Light (FPL) and request immediate grid shutoff if lines are down."
  },
  {
    category: "Exposures",
    description: "Protect neighboring buildings (Exposure Bravo/Delta) from radiant heat or flame impingement."
  },
  {
    category: "Forcible Entry",
    description: "Secure secondary egress or facilitate entry via front, side, or garage doors."
  },
  {
    category: "EMS / Victim Treatment",
    description: "Establish triage, treatment, and transport area for recovered victims or injured firefighters."
  },
  {
    category: "Staging",
    description: "Appoint Staging Officer and direct arriving units to hold short of immediate scene."
  },
  {
    category: "Rehab",
    description: "Establish a Rehab sector for active crew hydration, cooling, and monitoring."
  },
  {
    category: "PAR",
    description: "Conduct Personnel Accountability Reports (PAR) on milestones (e.g. 20-min timer, strategic transitions)."
  },
  {
    category: "Mayday",
    description: "Standard protocols for Firefighter Down/Mayday situations (LUNAR, priority radio)."
  }
];
