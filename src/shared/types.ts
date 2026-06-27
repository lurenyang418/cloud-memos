export const memoVisibilities = ["PRIVATE", "MEMBERS", "PUBLIC"] as const;
export type MemoVisibility = (typeof memoVisibilities)[number];

export const memoStates = ["ACTIVE", "ARCHIVED"] as const;
export type MemoState = (typeof memoStates)[number];

export type UserRole = "ADMIN" | "USER";
export type UserStatus = "ACTIVE" | "SUSPENDED";

export interface Viewer {
  id: string;
  name: string;
  email: string;
  username: string;
  role: UserRole;
  status: UserStatus;
}

export interface PublicContact {
  label: string;
  url: string;
}

export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  status: "PENDING" | "READY";
  url: string;
}

export interface MemoAuthor {
  id: string;
  name: string;
  username: string;
  image: string | null;
}

export interface Memo {
  id: string;
  content: string;
  visibility: MemoVisibility;
  state: MemoState;
  pinned: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
  author: MemoAuthor;
  tags: string[];
  attachments: Attachment[];
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
