import type { PublicContact } from "../shared/types";
import type { AppBindings } from "./bindings";

const APP_NAME_KEY = "app_name";
const CONTACT_LABEL_KEY = "public_contact_label";
const CONTACT_URL_KEY = "public_contact_url";

export interface InstanceConfiguration {
  appName: string;
  publicContact: PublicContact | null;
}

export async function getInstanceConfiguration(env: AppBindings): Promise<InstanceConfiguration> {
  const result = await env.DB.prepare("SELECT key, value FROM instance_settings WHERE key IN (?, ?, ?)")
    .bind(APP_NAME_KEY, CONTACT_LABEL_KEY, CONTACT_URL_KEY)
    .all<{ key: string; value: string }>();
  const settings = new Map(result.results.map((item) => [item.key, item.value]));
  const appName = settings.get(APP_NAME_KEY)?.trim() || env.APP_NAME;
  const url = settings.get(CONTACT_URL_KEY)?.trim() ?? "";
  const publicContact = url ? { label: settings.get(CONTACT_LABEL_KEY)?.trim() || "申请加入", url } : null;
  return { appName, publicContact };
}

export async function saveInstanceConfiguration(env: AppBindings, input: { appName: string; contactLabel: string; contactUrl: string }): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO instance_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(APP_NAME_KEY, input.appName, now),
    env.DB.prepare("INSERT INTO instance_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(CONTACT_LABEL_KEY, input.contactLabel, now),
    env.DB.prepare("INSERT INTO instance_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(CONTACT_URL_KEY, input.contactUrl, now),
  ]);
}
