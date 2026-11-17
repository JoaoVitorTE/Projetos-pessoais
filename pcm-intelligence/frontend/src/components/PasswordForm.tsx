import { useState } from "react";
import { api } from "../services/api";

type Props = { required: boolean; onChanged: () => void };
export function PasswordForm({ required, onChanged }: Props) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel password-panel">
      <h2>{required ? "Defina sua senha de acesso" : "Alterar minha senha"}</h2>
      <p>
        {required
          ? "Sua conta usa uma senha temporária. Troque-a para acessar a aplicação."
          : "A alteração encerra todas as suas sessões. Entre novamente com a nova senha."}
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          if (newPassword !== confirmation) {
            setError("A confirmação precisa ser igual à nova senha");
            return;
          }
          setBusy(true);
          try {
            await api("/auth/change-password", {
              method: "POST",
              body: JSON.stringify({ currentPassword, newPassword }),
            });
            setCurrent("");
            setNew("");
            setConfirmation("");
            onChanged();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Senha atual
          <input
            aria-label="Senha atual"
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label>
          Nova senha (mínimo 12 caracteres)
          <input
            aria-label="Nova senha (mínimo 12 caracteres)"
            type="password"
            required
            minLength={12}
            maxLength={72}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
          />
        </label>
        <label>
          Confirmar nova senha
          <input
            aria-label="Confirmar nova senha"
            type="password"
            required
            minLength={12}
            maxLength={72}
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button disabled={busy}>
          {busy ? "Salvando…" : "Salvar nova senha e entrar novamente"}
        </button>
      </form>
    </section>
  );
}
