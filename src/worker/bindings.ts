export type AppBindings = Env & {
  BETTER_AUTH_SECRET: string;
  BOOTSTRAP_ADMIN_TOKEN: string;
};

export interface AppVariables {
  viewer: {
    id: string;
    name: string;
    email: string;
    username: string;
    role: "ADMIN" | "USER";
    status: "ACTIVE" | "SUSPENDED";
  };
}

export type AppEnv = {
  Bindings: AppBindings;
  Variables: AppVariables;
};
