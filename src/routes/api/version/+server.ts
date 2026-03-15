import { json } from "@sveltejs/kit";

export function GET(): Response {
  return json({ buildTime: __BUILD_DATE__ });
}
