import { useEffect, useState } from "react";
import type { ModuleId, NavigationOptions } from "../types/navigation";
const ids: ModuleId[] = [
  "home",
  "dashboard",
  "equipment",
  "interruptions",
  "orders",
  "scheduling",
  "plans",
  "third",
  "imports",
  "reports",
  "assistant",
  "alerts",
  "administration",
  "audit",
  "security",
  "help",
];
function read() {
  const raw = location.hash.slice(1),
    [name, query = ""] = raw.split("?"),
    params = new URLSearchParams(query);
  const options: NavigationOptions = {};
  if (params.get("record"))
    options.recordId = params.get("record")!.slice(0, 120);
  if (name === "orders" && params.get("nova") === "true")
    options.createOrder = true;
  if (params.get("overdue") === "true") options.overdue = true;
  if (params.get("q")) options.q = params.get("q")!.slice(0, 120);
  const adminTab = params.get("tab");
  if (["users", "technicians", "sectors"].includes(adminTab || ""))
    options.adminTab = adminTab as NavigationOptions["adminTab"];
  return {
    id: ids.includes(name as ModuleId)
      ? (name as ModuleId)
      : ("home" as ModuleId),
    options,
    key: raw,
  };
}
export function useNavigation() {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const update = () => setRoute(read());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  function navigate(id: ModuleId, options: NavigationOptions = {}) {
    const params = new URLSearchParams();
    if (options.recordId) params.set("record", options.recordId);
    if (id === "orders" && options.createOrder) params.set("nova", "true");
    if (options.overdue) params.set("overdue", "true");
    if (options.q) params.set("q", options.q);
    if (options.adminTab) params.set("tab", options.adminTab);
    const hash = id + (params.size ? "?" + params : "");
    if (location.hash.slice(1) !== hash) location.hash = hash;
    else setRoute({ ...read() });
  }
  return { route, navigate };
}
