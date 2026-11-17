import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Factory,
  ShieldCheck,
  LogOut,
  Sun,
  Moon,
  Database,
  ArrowRight,
  CheckCircle2,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import "./styles.css";
import { api } from "./services/api";
import { PasswordForm } from "./components/PasswordForm";
type User = {
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
};
type Foundation = { dataMode: string; counts: Record<string, number> };
function App() {
  const [user, setUser] = useState<User | null>(null),
    [boot, setBoot] = useState(true),
    [data, setData] = useState<Foundation | null>(null),
    [email, setEmail] = useState("admin@pcm.demo"),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [info, setInfo] = useState(""),
    [dark, setDark] = useState(localStorage.getItem("theme") === "dark"),
    [tab, setTab] = useState("overview"),
    [records, setRecords] = useState<any[]>([]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    api("/auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setBoot(false));
  }, []);
  async function load() {
    setError("");
    try {
      setData(await api("/foundation"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (user && !user.mustChangePassword) void load();
  }, [user]);
  async function openTab(t: string) {
    setTab(t);
    setRecords([]);
    setError("");
    try {
      if (t === "users") setRecords(await api("/admin/users"));
      if (t === "audit") setRecords(await api("/audit"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function passwordChanged() {
    setUser(null);
    setData(null);
    setRecords([]);
    setTab("overview");
    setError("");
    setInfo("Senha alterada. Entre com a nova senha.");
  }
  if (boot)
    return <div className="loading">Conectando ao PCM Intelligence…</div>;
  if (!user)
    return (
      <main className="login">
        <section className="login-story">
          <div className="brand">
            <Activity /> PCM <b>INTELLIGENCE</b>
          </div>
          <span className="eyebrow">INTELIGÊNCIA PARA A OPERAÇÃO</span>
          <h1>
            O próximo passo
            <br />
            da sua manutenção.
          </h1>
          <p>
            Uma base conectada para planejar melhor,
            <br />
            reduzir retrabalho e decidir com dados.
          </p>
          <div className="factory-art">
            <Factory size={150} strokeWidth={0.7} />
            <span>PCM / PLATAFORMA INDUSTRIAL</span>
          </div>
          <small>Ambiente de demonstração · Dados inteiramente fictícios</small>
        </section>
        <section className="login-form">
          <div className="login-box">
            <span className="badge">FASE 01 · FUNDAÇÃO</span>
            <h2>Bem-vindo ao PCM</h2>
            <p>Acesse seu ambiente de manutenção.</p>
            {info && (
              <p role="status" className="success">
                {info}
              </p>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  setUser(
                    await api("/auth/login", {
                      method: "POST",
                      body: JSON.stringify({ email, password }),
                    }),
                  );
                  setPassword("");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                E-mail
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                />
              </label>
              <label>
                Senha
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </label>
              {error && (
                <div role="alert" className="error">
                  {error}
                </div>
              )}
              <button disabled={busy}>
                {busy ? "Autenticando…" : "Entrar na plataforma"}
                <ArrowRight size={17} />
              </button>
            </form>
            <div className="security">
              <ShieldCheck size={18} /> Sessão protegida · Acesso por permissões
            </div>
            <p className="hint">
              Use a senha temporária fornecida para a demonstração. No primeiro
              acesso, defina uma nova senha.
            </p>
          </div>
        </section>
      </main>
    );
  if (user.mustChangePassword)
    return (
      <main className="first-password">
        <div className="brand">
          <Activity /> PCM <b>INTELLIGENCE</b>
        </div>
        <PasswordForm required onChanged={passwordChanged} />
        <button
          className="secondary"
          onClick={async () => {
            try {
              await api("/auth/logout", { method: "POST" });
              setUser(null);
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Sair
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </main>
    );
  const labels: Record<string, string> = {
    equipment: "Equipamentos",
    sectors: "Setores industriais",
    technicians: "Técnicos",
    interruptions: "Interrupções",
    orders: "Ordens locais",
    preventives: "Planos preventivos",
    lubrications: "Planos de lubrificação",
    thirdParties: "Processos de terceiros",
    airReadings: "Leituras de ar comprimido",
  };
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <Activity /> PCM <b>INTELLIGENCE</b>
        </div>
        <div className="workspace">
          <span className="workspace-icon">
            <Factory size={21} />
          </span>
          <div>
            Unidade demonstrativa<small>Dados fictícios</small>
          </div>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <button
          className={tab === "overview" ? "nav active" : "nav"}
          onClick={() => openTab("overview")}
        >
          <Activity size={18} />
          Visão da fundação
        </button>
        {user.role === "ADMIN" && (
          <button
            className={tab === "users" ? "nav active" : "nav"}
            onClick={() => openTab("users")}
          >
            <ShieldCheck size={18} />
            Usuários e perfis
          </button>
        )}
        {["ADMIN", "MANAGER"].includes(user.role) && (
          <button
            className={tab === "audit" ? "nav active" : "nav"}
            onClick={() => openTab("audit")}
          >
            <Database size={18} />
            Auditoria
          </button>
        )}
        <button
          className={tab === "security" ? "nav active" : "nav"}
          onClick={() => openTab("security")}
        >
          <LockKeyhole size={18} />
          Minha senha
        </button>
        <p className="nav-label">PRÓXIMAS ETAPAS</p>
        {[
          "Dashboard operacional",
          "Equipamentos e interrupções",
          "Ordens de serviço",
          "Preventivas e lubrificação",
          "Serviços de terceiros",
          "Assistente PCM",
        ].map((x) => (
          <div className="future" key={x}>
            <LockKeyhole size={14} />
            {x}
            <small>Futuro</small>
          </div>
        ))}
        <div className="aside-bottom">
          <span className="status-dot" /> Somente dados de demonstração
          <p>PCM Intelligence · v0.1.0</p>
        </div>
      </aside>
      <div className="main">
        <header>
          <span>
            Plataforma / <strong>Fundação</strong>
          </span>
          <div>
            <span className="badge">DEMONSTRAÇÃO</span>
            <button
              className="icon"
              aria-label="Alternar tema"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <span className="user">
              {user.name}
              <small>{user.role}</small>
            </span>
            <button
              className="icon"
              aria-label="Sair"
              onClick={async () => {
                try {
                  await api("/auth/logout", { method: "POST" });
                  setUser(null);
                  setData(null);
                  setTab("overview");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="content">
          <div className="page-title">
            <div>
              <span className="eyebrow">PCM INTELLIGENCE / FASE 01</span>
              <h1>
                {tab === "overview"
                  ? "Uma base sólida para evoluir."
                  : tab === "users"
                    ? "Usuários e permissões"
                    : tab === "security"
                      ? "Segurança da conta"
                      : "Histórico de acesso"}
              </h1>
              <p>
                {tab === "overview"
                  ? "Infraestrutura, segurança e dados preparados para a operação."
                  : "Informações consultadas diretamente na API com autorização no servidor."}
              </p>
            </div>
            <button
              className="secondary"
              onClick={() => (tab === "overview" ? load() : openTab(tab))}
            >
              <RefreshCw size={16} />
              Atualizar
            </button>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {tab === "security" ? (
            <PasswordForm required={false} onChanged={passwordChanged} />
          ) : tab === "overview" ? (
            <>
              <div className="notice">
                <ShieldCheck size={22} />
                <div>
                  <strong>Ambiente de demonstração isolado</strong>
                  <p>
                    Registros fictícios, sem conexão com SAP, SKA ou
                    equipamentos industriais.
                  </p>
                </div>
                <span className="badge">DADOS FICTÍCIOS</span>
              </div>
              <section className="section-title">
                <h2>Base de demonstração</h2>
                <span>Contagens consultadas no PostgreSQL</span>
              </section>
              <div className="cards">
                {Object.entries(labels).map(([key, label]) => (
                  <article className="card" key={key}>
                    <span>
                      {label}
                      <Database size={16} />
                    </span>
                    <strong>
                      {data ? data.counts[key]?.toLocaleString("pt-BR") : "—"}
                    </strong>
                    <small>
                      <span className="status-dot" /> Dados fictícios
                    </small>
                  </article>
                ))}
              </div>
              <div className="bottom-grid">
                <article className="panel">
                  <h2>Prontidão da plataforma</h2>
                  <p>Componentes disponíveis nesta versão</p>
                  {[
                    "Autenticação com sessão protegida",
                    "Cinco perfis e autorização no backend",
                    "Banco relacional e dados de demonstração",
                    "Logs de auditoria de acesso",
                  ].map((x) => (
                    <div className="check-row" key={x}>
                      <CheckCircle2 size={19} />
                      {x}
                    </div>
                  ))}
                </article>
                <article className="panel roadmap">
                  <span className="badge">PRÓXIMO MARCO</span>
                  <h2>Do dado à operação.</h2>
                  <p>
                    A Fase 2 adicionará o dashboard calculado e os fluxos de
                    equipamentos, interrupções, ordens, preventivas e terceiros.
                  </p>
                  <div className="progress">
                    <i />
                  </div>
                  <small>Fase 1 de 5 · Fundação implementada</small>
                </article>
              </div>
            </>
          ) : (
            <section className="panel table-wrap">
              <table>
                <thead>
                  <tr>
                    {(tab === "users"
                      ? ["Nome", "E-mail", "Perfil"]
                      : ["Data", "Usuário", "Ação", "Entidade"]
                    ).map((x) => (
                      <th key={x}>{x}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr key={r.id || i}>
                      {(tab === "users"
                        ? [r.name, r.email, r.role]
                        : [
                            new Date(r.createdAt).toLocaleString("pt-BR"),
                            r.user?.name || "Não autenticado",
                            r.action,
                            r.entity,
                          ]
                      ).map((v, j) => (
                        <td key={j}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!records.length && <p>Nenhum registro disponível.</p>}
            </section>
          )}
          <footer>
            PCM Intelligence{" "}
            <span>
              Fase 1 · Integrações e módulos operacionais ainda não habilitados
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
