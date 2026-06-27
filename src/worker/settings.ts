import type { PublicContact } from "../shared/types";
import type { AppBindings } from "./bindings";

const CONTACT_LABEL_KEY = "public_contact_label";
const CONTACT_URL_KEY = "public_contact_url";

export async function getPublicContact(env: AppBindings): Promise<PublicContact | null> {
  const result = await env.DB.prepare("SELECT key, value FROM instance_settings WHERE key IN (?, ?)")
    .bind(CONTACT_LABEL_KEY, CONTACT_URL_KEY)
    .all<{ key: string; value: string }>();
  const settings = new Map(result.results.map((item) => [item.key, item.value]));
  const url = settings.get(CONTACT_URL_KEY)?.trim() ?? "";
  if (!url) return null;
  return { label: settings.get(CONTACT_LABEL_KEY)?.trim() || "申请加入", url };
}

export async function savePublicContact(env: AppBindings, contact: { contactLabel: string; contactUrl: string }): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO instance_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(CONTACT_LABEL_KEY, contact.contactLabel, now),
    env.DB.prepare("INSERT INTO instance_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(CONTACT_URL_KEY, contact.contactUrl, now),
  ]);
}
