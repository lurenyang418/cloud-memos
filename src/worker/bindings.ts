export type AppBindings = Env & {
  BETTER_AUTH_SECRET: string;
  BOOTSTRAP_ADMIN_TOKEN: string;
};

import type { ApiScope } from "../shared/types";

export interface AppVariables {
  viewer: {
    id: string;
    name: string;
    email: string;
    username: string;
    role: "ADMIN" | "USER";
    status: "ACTIVE" | "SUSPENDED";
  };
  authType: "SESSION" | "API_TOKEN";
  scopes: ApiScope[];
}

export type AppEnv = {
  Bindings: AppBindings;
  Variables: AppVariables;
};
