import { create } from "zustand";
import { db } from "@/db/dexie";

interface SessionState {
  designation: string;
  clientId: string;
  roomCode: string | null;
  role: "Host/Instructor" | "Participant";
  isSolo: boolean;
  isConnected: boolean;
  setDesignation: (name: string) => void;
  setClientId: (id: string) => void;
  setRoomCode: (code: string | null) => void;
  setRole: (role: "Host/Instructor" | "Participant") => void;
  setIsSolo: (isSolo: boolean) => void;
  setIsConnected: (connected: boolean) => void;
  loadPreferences: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  designation: "",
  clientId: Math.random().toString(36).substring(2, 11),
  roomCode: null,
  role: "Participant",
  isSolo: true,
  isConnected: false,

  setDesignation: async (name) => {
    set({ designation: name });
    await db.userPreferences.put({ key: "designation", value: name });
  },
  setClientId: (id) => set({ clientId: id }),
  setRoomCode: (code) => set({ roomCode: code }),
  setRole: (role) => set({ role }),
  setIsSolo: (isSolo) => set({ isSolo }),
  setIsConnected: (connected) => set({ isConnected: connected }),

  loadPreferences: async () => {
    const cached = await db.userPreferences.get("designation");
    if (cached) {
      set({ designation: cached.value });
    }
  }
}));
