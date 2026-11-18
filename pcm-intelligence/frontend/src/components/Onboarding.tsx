import { useState } from "react";
import {
  Home,
  Compass,
  Users,
  CalendarClock,
  ClipboardCheck,
  BookOpen,
  ArrowRight,
  Check,
  Download,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import guide from "../../../training/guide.json";
import { Modal } from "./OperationalUI";
import { Brand } from "./Brand";
import { api } from "../services/api";
import { allowedEntries } from "./Navigation";
import type { User } from "../types/operations";
import type { ModuleId, Navigate } from "../types/navigation";
const icons = {
  home: Home,
  navigation: Compass,
  users: Users,
  calendar: CalendarClock,
  orders: ClipboardCheck,
  help: BookOpen,
};
export type OnboardingPreferences = {
  onboardingVersion: number;
  onboardingCompletedAt: string | null;
};
export function Onboarding({
  user,
  onClose,
  onNavigate,
  onSaved,
}: {
  user: User;
  onClose: () => void;
  onNavigate: Navigate;
  onSaved: (p: OnboardingPreferences) => void;
}) {
  const [index, setIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    slide = guide.onboarding[index],
    Icon = icons[slide.icon as keyof typeof icons];
  async function save(action: "COMPLETE" | "DISMISS") {
    setBusy(true);
    setError("");
    try {
      const prefs = await api("/onboarding", {
        method: "POST",
        body: JSON.stringify({ version: guide.onboardingVersion, action }),
      });
      onSaved(prefs);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Primeiro acesso" onClose={onClose}>
      <div className="onboarding-content">
        <div className="onboarding-topline">
          <Brand />
          <span>
            Etapa {index + 1} de {guide.onboarding.length}
          </span>
        </div>
        <div className="onboarding-visual">
          <span className="onboarding-icon">
            <Icon size={44} strokeWidth={1.6} />
          </span>
          <div className="onboarding-mini">
            <span>
              <Check size={13} />
              Organização
            </span>
            <span>
              <Check size={13} />
              Histórico
            </span>
            <span>
              <Check size={13} />
              Decisão com dados
            </span>
          </div>
        </div>
        <h3>{slide.title}</h3>
        <p>{slide.text}</p>
        <ul className="onboarding-points">
          {slide.points.map((p) => (
            <li key={p}>
              <Check size={16} />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <div className="onboarding-dots">
          {guide.onboarding.map((s, i) => (
            <button
              key={s.title}
              type="button"
              className={i === index ? "active" : ""}
              aria-label={"Ir para a etapa " + (i + 1) + ": " + s.title}
              aria-current={i === index ? "step" : undefined}
              onClick={() => {
                setIndex(i);
                setError("");
              }}
            />
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="onboarding-actions">
          <button
            className="text-button"
            disabled={busy}
            onClick={() => save("DISMISS")}
          >
            Fazer depois
          </button>
          <div className="row-actions">
            {index > 0 && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setIndex((i) => i - 1)}
              >
                <ArrowLeft size={16} />
                Voltar
              </button>
            )}
            {index < guide.onboarding.length - 1 ? (
              <button disabled={busy} onClick={() => setIndex((i) => i + 1)}>
                Próximo
                <ArrowRight size={16} />
              </button>
            ) : (
              <button disabled={busy} onClick={() => save("COMPLETE")}>
                {busy ? "Salvando…" : "Começar a usar"}
                <Check size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="onboarding-bottom">
          <a href={guide.pdfUrl} download>
            <Download size={14} />
            Manual em PDF
          </a>
          {allowedEntries(user).some((e) => e.id === slide.module) && (
            <button
              className="text-button"
              onClick={() => {
                onClose();
                onNavigate(slide.module as ModuleId);
              }}
            >
              Conhecer esta área
              <ExternalLink size={13} />
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
