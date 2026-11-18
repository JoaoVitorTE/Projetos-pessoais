import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { Search, ShieldCheck, BookOpen, ChevronRight } from "lucide-react";
import type { User, Lookups } from "../types/operations";
import { useResource } from "../hooks/useResource";
import { useNavigation } from "../hooks/useNavigation";
import { State } from "./OperationalUI";
import { PasswordForm } from "./PasswordForm";
import { FloatingNavigation, allowedEntries } from "./Navigation";
import { Onboarding, type OnboardingPreferences } from "./Onboarding";
import { HomePage, type HomeData } from "../pages/Home";
import { HelpPage } from "../pages/Help";

export function OperationalShell({
  user,
  dark,
  onTheme,
  onLogout,
  onPasswordChanged,
  onPreferencesChanged,
}: {
  user: User;
  dark: boolean;
  onTheme: () => void;
  onLogout: () => Promise<void>;
  onPasswordChanged: () => void;
  onPreferencesChanged: (p: OnboardingPreferences) => void;
}) {
  const { route, navigate } = useNavigation();
  const entries = allowedEntries(user),
    current = entries.find((e) => e.id === route.id) || entries[0],
    tab = current.id;
  const [search, setSearch] = useState(route.options.q || ""),
    [tutorial, setTutorial] = useState((user.onboardingVersion ?? 0) < 1);
  const q = useDeferredValue(search),
    lookups = useResource<Lookups>("/lookups"),
    home = useResource<HomeData>("/home");
  const previous = useRef(tab),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    setSearch(route.options.q || "");
    if (previous.current !== tab) {
      if (tab === "home") home.refresh();
      heading.current?.focus();
      previous.current = tab;
    }
  }, [route.key, tab]);
  useEffect(() => {
    if (!entries.some((e) => e.id === route.id)) navigate("home");
  }, [route.id, user.role]);
  const refreshLookups = () => {
    lookups.refresh();
  };
  return (
    <div className="workspace-shell">
      <FloatingNavigation
        user={user}
        active={tab}
        onNavigate={navigate}
        dark={dark}
        onTheme={onTheme}
        onLogout={onLogout}
        mode={lookups.data?.mode}
        alertCount={home.data?.counts.alerts || 0}
      />
      <main className="workspace-content" id="workspace-main" tabIndex={-1}>
        <div className="workspace-breadcrumb">
          <button onClick={() => navigate("home")}>PCM Intelligence</button>
          <ChevronRight size={13} />
          <span>{current.label}</span>
          <button className="workspace-help" onClick={() => navigate("help")}>
            <BookOpen size={14} />
            Ajuda
          </button>
        </div>
        <div className="page-title">
          <div>
            <span className="eyebrow">
              PLANEJAMENTO E CONTROLE DE MANUTENÇÃO
            </span>
            <h1 ref={heading} tabIndex={-1}>
              {current.label}
            </h1>
            <p>{current.description}</p>
          </div>
          {["equipment", "interruptions", "orders", "plans", "third"].includes(
            tab,
          ) && (
            <label className="search-box">
              <Search size={17} />
              <input
                aria-label="Pesquisar no módulo"
                type="search"
                placeholder="Pesquisar neste módulo…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          )}
        </div>
        {lookups.data?.mode === "demo" && (
          <div className="notice compact-notice">
            <ShieldCheck size={18} />
            <p>Ambiente de demonstração com dados fictícios.</p>
          </div>
        )}
        <State error={lookups.error} loading={lookups.loading} />
        {tab === "home" ? (
          <HomePage
            user={user}
            lookups={lookups.data || undefined}
            {...home}
            onRefresh={home.refresh}
            onNavigate={navigate}
            onTutorial={() => setTutorial(true)}
          />
        ) : tab === "help" ? (
          <HelpPage
            user={user}
            onNavigate={navigate}
            onTutorial={() => setTutorial(true)}
          />
        ) : (
          lookups.data && (
            <Suspense
              fallback={
                <p role="status" className="muted">
                  Carregando módulo…
                </p>
              }
            >
              <div key={route.key}>
                {tab === "dashboard" ? (
                  <Dashboard lookups={lookups.data} />
                ) : tab === "equipment" ? (
                  <EquipmentPage
                    user={user}
                    lookups={lookups.data}
                    search={q}
                    onChanged={refreshLookups}
                  />
                ) : tab === "interruptions" ? (
                  <InterruptionsPage
                    user={user}
                    lookups={lookups.data}
                    search={q}
                  />
                ) : tab === "orders" ? (
                  <OrdersPage
                    user={user}
                    lookups={lookups.data}
                    search={q}
                    initialRecordId={route.options.recordId}
                    initialOverdue={route.options.overdue}
                  />
                ) : tab === "scheduling" ? (
                  <SchedulingPage
                    user={user}
                    lookups={lookups.data}
                    onChanged={refreshLookups}
                    initialRecordId={route.options.recordId}
                  />
                ) : tab === "plans" ? (
                  <PlansPage
                    user={user}
                    lookups={lookups.data}
                    search={q}
                    initialRecordId={route.options.recordId}
                    initialOverdue={route.options.overdue}
                  />
                ) : tab === "third" ? (
                  <ThirdPartiesPage
                    user={user}
                    search={q}
                    initialRecordId={route.options.recordId}
                    initialOverdue={route.options.overdue}
                  />
                ) : tab === "security" ? (
                  <PasswordForm
                    required={false}
                    onChanged={onPasswordChanged}
                  />
                ) : tab === "imports" ? (
                  <ImportsPage
                    lookups={lookups.data}
                    onChanged={refreshLookups}
                  />
                ) : tab === "reports" ? (
                  <ReportsPage lookups={lookups.data} />
                ) : tab === "assistant" ? (
                  <AssistantPage />
                ) : tab === "alerts" ? (
                  <AlertsPage onNavigate={navigate} />
                ) : tab === "administration" ? (
                  <AdministrationPage
                    user={user}
                    onChanged={refreshLookups}
                    initialTab={route.options.adminTab}
                  />
                ) : (
                  <AuditPage />
                )}
              </div>
            </Suspense>
          )
        )}
        <footer className="workspace-footer">
          <span>
            PCM Intelligence <small>v0.6</small>
          </span>
          <span>Planejar com clareza. Executar com controle.</span>
        </footer>
      </main>
      {tutorial && (
        <Onboarding
          user={user}
          onClose={() => setTutorial(false)}
          onNavigate={navigate}
          onSaved={onPreferencesChanged}
        />
      )}
    </div>
  );
}
const Dashboard = lazy(() =>
  import("../pages/Dashboard").then((m) => ({ default: m.Dashboard })),
);
const EquipmentPage = lazy(() =>
  import("../pages/Equipment").then((m) => ({ default: m.EquipmentPage })),
);
const InterruptionsPage = lazy(() =>
  import("../pages/Interruptions").then((m) => ({
    default: m.InterruptionsPage,
  })),
);
const OrdersPage = lazy(() =>
  import("../pages/Orders").then((m) => ({ default: m.OrdersPage })),
);
const PlansPage = lazy(() =>
  import("../pages/Plans").then((m) => ({ default: m.PlansPage })),
);
const ThirdPartiesPage = lazy(() =>
  import("../pages/ThirdParties").then((m) => ({
    default: m.ThirdPartiesPage,
  })),
);
const ImportsPage = lazy(() =>
  import("../pages/Imports").then((m) => ({ default: m.ImportsPage })),
);
const ReportsPage = lazy(() =>
  import("../pages/Reports").then((m) => ({ default: m.ReportsPage })),
);
const AssistantPage = lazy(() =>
  import("../pages/Intelligence").then((m) => ({ default: m.AssistantPage })),
);
const AlertsPage = lazy(() =>
  import("../pages/Intelligence").then((m) => ({ default: m.AlertsPage })),
);
const AdministrationPage = lazy(() =>
  import("../pages/Administration").then((m) => ({
    default: m.AdministrationPage,
  })),
);
const AuditPage = lazy(() =>
  import("../pages/Audit").then((m) => ({ default: m.AuditPage })),
);
const SchedulingPage = lazy(() =>
  import("../pages/Scheduling").then((m) => ({ default: m.SchedulingPage })),
);
