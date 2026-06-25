export interface AssetDefinition {
  id: string;
  name: string;
  path: string;
  fallbackSvg?: string;
  license?: string;
}

export const assetManifest = {
  vehicles: {
    engine: {
      id: "engine",
      name: "Tactical Fire Engine",
      path: "/assets/tactical/engine.png",
      fallbackSvg: "engine-vector",
      license: "CC0 / Procedural"
    },
    ladder: {
      id: "ladder",
      name: "Tactical Ladder Truck",
      path: "/assets/tactical/ladder.png",
      fallbackSvg: "ladder-vector",
      license: "CC0 / Procedural"
    },
    rescue: {
      id: "rescue",
      name: "Tactical Rescue / Rescue Unit",
      path: "/assets/tactical/rescue.png",
      fallbackSvg: "rescue-vector",
      license: "CC0 / Procedural"
    },
    suv: {
      id: "suv",
      name: "Command / Safety SUV",
      path: "/assets/tactical/suv.png",
      fallbackSvg: "suv-vector",
      license: "CC0 / Procedural"
    }
  },
  icons: {
    hydrant: "/assets/tactical/hydrant.png",
    smoke: "/assets/kenney/smoke.png",
    victim: "/assets/tactical/victim.png",
    hazard: "/assets/tactical/hazard.png"
  }
};
