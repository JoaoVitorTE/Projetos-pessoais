import { createApp } from "../backend/src/app.js";
import { getDatabase } from "../backend/src/database.js";

if (process.env.DATA_MODE !== "demo") {
  throw new Error("Esta versão exige DATA_MODE=demo");
}
// Uma instância por processo; as sessões permanecem no PostgreSQL entre invocações.
export default createApp(getDatabase());
