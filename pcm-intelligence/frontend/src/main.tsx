import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CalendarClock,
  ChartNoAxesCombined,
  ClipboardCheck,
  ShieldCheck,
  ArrowRight,
  Eye,
  EyeOff,
  Download,
  KeyRound,
  Moon,
  Sun,
} from "lucide-react";
import "@fontsource/barlow-semi-condensed/latin-700.css";
import "./styles.css";
import "./experience.css";
import "./visual.css";
import { api } from "./services/api";
import { OperationalShell } from "./components/OperationalShell";
import { PasswordForm } from "./components/PasswordForm";
import { LegalLinks } from "./components/LegalLinks";
import { Brand } from "./components/Brand";
import type { User } from "./types/operations";
function App() {
  const [user, setUser] = useState<User | null>(null),
    [boot, setBoot] = useState(true),
    [email, setEmail] = useState(""),
    [visible, setVisible] = useState(false),
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
      <main className="login modern-login">
        <section className="login-story">
          <Brand light />
          <h1>Planejamento e controle da manutenção</h1>
          <p>
            Programe a equipe, acompanhe ordens de serviço e consulte o
            histórico de execução.
          </p>
          <div className="login-features">
            {[
              {
                icon: CalendarClock,
                title: "Planeje com a equipe",
                text: "Agenda, disponibilidade e planos preventivos.",
              },
              {
                icon: ClipboardCheck,
                title: "Acompanhe cada atividade",
                text: "Ordens, responsáveis e histórico de alterações.",
              },
              {
                icon: ChartNoAxesCombined,
                title: "Decida com dados",
                text: "Indicadores calculados e alertas explicáveis.",
              },
            ].map((f) => (
              <div key={f.title}>
                <span>
                  <f.icon size={21} />
                </span>
                <div>
                  <b>{f.title}</b>
                  <p>{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="login-form">
          <button
            type="button"
            className="header-icon login-theme"
            aria-label={dark ? "Ativar tema claro" : "Ativar tema escuro"}
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          <div className="login-box">
            <span className="login-key">
              <KeyRound size={21} />
            </span>
            <h2>Acesse sua conta</h2>
            <p>Entre com a conta fornecida pelo administrador.</p>
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
                      body: JSON.stringify({
                        email,
                        password,
                        termsVersion: "2026-11-27",
                      }),
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
                <span className="password-input">
                  <input
                    type={visible ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    className="password-eye"
                    type="button"
                    aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </label>
              {error && (
                <div role="alert" className="error">
                  {error}
                </div>
              )}
              <label className="login-terms">
                <input type="checkbox" required />
                <span>
                  Li e aceito os{" "}
                  <a
                    href="/docs/privacidade.html#termos"
                    target="_blank"
                    rel="noopener"
                  >
                    Termos de uso
                  </a>{" "}
                  e tomei ciência da{" "}
                  <a
                    href="/docs/privacidade.html#privacidade"
                    target="_blank"
                    rel="noopener"
                  >
                    Política de privacidade
                  </a>
                  .
                </span>
              </label>
              <button disabled={busy}>
                {busy ? "Autenticando…" : "Entrar na plataforma"}
                <ArrowRight size={17} />
              </button>
            </form>
            <div className="security">
              <ShieldCheck size={18} /> Sessão protegida · Acesso por permissões
            </div>
            <p className="hint">
              Use a senha fornecida pelo administrador. No primeiro acesso,
              defina uma nova senha.
            </p>
            <a
              className="login-manual"
              href="/docs/manual-pcm-intelligence.pdf"
              download
            >
              <Download size={16} />
              Manual de primeiro acesso e treinamento
            </a>
            <LegalLinks cookieNotice />
          </div>
        </section>
      </main>
    );
  if (user.mustChangePassword)
    return (
      <main className="first-password">
        <Brand />
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
      onPreferencesChanged={(preferences) =>
        setUser((current) =>
          current ? { ...current, ...preferences } : current,
        )
      }
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
