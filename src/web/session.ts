import { createContext, useContext } from "react";
import type { Viewer } from "../shared/types";
import type { SessionResponse } from "./api";

export interface SessionContextValue extends SessionResponse {
  viewer: Viewer;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used in a protected route");
  return value;
}
