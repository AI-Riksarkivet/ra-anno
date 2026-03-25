import { command } from "$app/server";
import * as v from "valibot";

const BulkUpdateSchema = v.object({
  dataset_id: v.string(),
  page_ids: v.array(v.string()),
  updates: v.record(v.string(), v.string()),
});

export const bulk_update_pages = command(
  BulkUpdateSchema,
  async ({ dataset_id, page_ids, updates }) => {
    // Mock: in production this would update the database/Arrow tables
    console.log(
      `[bulk-update] dataset=${dataset_id} pages=${page_ids.length} updates=`,
      updates,
    );

    return {
      success: true,
      updated: page_ids.length,
      fields: Object.keys(updates),
    };
  },
);
