import type { ApiErrorBody, CursorPage, Memo, PublicContact, Viewer } from "../shared/types";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && typeof init.body === "string" && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers, credentials: "same-origin" });
  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try { body = await response.json() as ApiErrorBody; } catch { /* Non-JSON upstream error. */ }
    throw new ApiError(response.status, body?.error.code ?? "REQUEST_FAILED", body?.error.message ?? `请求失败 (${response.status})`, body?.error.details);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export interface SessionResponse {
  viewer: Viewer | null;
  setupRequired: boolean;
  appName: string;
  publicContact: PublicContact | null;
}

export function getSession() {
  return api<SessionResponse>("/api/v1/session");
}

export function signOutSession() {
  return api<{ success: boolean }>("/api/auth/sign-out", { method: "POST", body: "{}" });
}

export interface MemoFilters {
  state?: "ACTIVE" | "ARCHIVED";
  limit?: number;
  visibility?: string;
  q?: string;
  tag?: string;
  cursor?: string;
}

export function listMemos(filters: MemoFilters = {}) {
  const params = new URLSearchParams();
  if (filters.state) params.set("state", filters.state);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.visibility) params.set("visibility", filters.visibility);
  if (filters.q) params.set("q", filters.q);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.cursor) params.set("cursor", filters.cursor);
  return api<CursorPage<Memo>>(`/api/v1/memos?${params}`);
}

export function listFeed(filters: MemoFilters = {}) {
  const params = new URLSearchParams();
  if (filters.visibility) params.set("visibility", filters.visibility);
  if (filters.q) params.set("q", filters.q);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.cursor) params.set("cursor", filters.cursor);
  return api<CursorPage<Memo>>(`/api/v1/feed?${params}`);
}

export function listPublicMemos(filters: MemoFilters = {}) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.cursor) params.set("cursor", filters.cursor);
  return api<CursorPage<Memo>>(`/api/v1/public/memos?${params}`);
}

export function getMemo(id: string) {
  return api<Memo>(`/api/v1/memos/${id}`);
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}
