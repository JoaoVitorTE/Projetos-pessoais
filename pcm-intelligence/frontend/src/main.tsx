import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, Factory, ShieldCheck, ArrowRight } from "lucide-react";
import "./styles.css";
import { api } from "./services/api";
import { OperationalShell } from "./components/OperationalShell";
import { PasswordForm } from "./components/PasswordForm";
type User = {
  id: string;
  technicianId: string | null;
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
};
function App() {
  const [user, setUser] = useState<User | null>(null),
    [boot, setBoot] = useState(true),
    [email, setEmail] = useState("admin@pcm.demo"),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [info, setInfo] = useState(""),
    [dark, setDark] = useState(localStorage.getItem("theme") === "dark");
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
  function passwordChanged() {
    setUser(null);
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
            <span className="badge">FASE 02 · OPERAÇÃO</span>
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
  return (
    <OperationalShell
      user={user}
      dark={dark}
      onTheme={() => setDark(!dark)}
      onPasswordChanged={passwordChanged}
      onLogout={async () => {
        await api("/auth/logout", { method: "POST" });
        setUser(null);
        setInfo("");
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
