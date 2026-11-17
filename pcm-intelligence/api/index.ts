import { createApp } from "../backend/src/app.js";
import { getDatabase } from "../backend/src/database.js";

if (!["demo", "operational"].includes(process.env.DATA_MODE || "")) {
  throw new Error("Configure DATA_MODE=demo ou operational");
}
// Uma instância por processo; as sessões permanecem no PostgreSQL entre invocações.
export default createApp(getDatabase());
