import { useState } from "react";
import {
  Search,
  Download,
  BookOpen,
  ArrowUpRight,
  PlayCircle,
  CheckCircle2,
  ArrowRight,
  MonitorSmartphone,
} from "lucide-react";
import guide from "../../../training/guide.json";
import { allowedEntries } from "../components/Navigation";
import type { User } from "../types/operations";
import type { ModuleId, Navigate } from "../types/navigation";
import { roleNames, roleDescriptions } from "../types/navigation";
export function HelpPage({
  user,
  onNavigate,
  onTutorial,
}: {
  user: User;
  onNavigate: Navigate;
  onTutorial: () => void;
}) {
  const [q, setQ] = useState(""),
    [category, setCategory] = useState("Todas");
  const norm = (s: string) =>
      s
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase(),
    allowed = new Set(allowedEntries(user).map((e) => e.id));
  const topics = guide.topics.filter(
    (t) =>
      (category === "Todas" || t.category === category) &&
      norm(t.title + " " + t.summary + " " + t.steps.join(" ")).includes(
        norm(q),
      ),
  );
  return (
    <>
      <section className="help-hero">
        <div>
          <span className="section-kicker">SUPORTE E TREINAMENTO</span>
          <h2>Encontre o caminho. Ganhe autonomia.</h2>
          <p>
            Procedimentos por assunto, apresentação do primeiro acesso e
            material para treinar outros usuários.
          </p>
          <div className="row-actions">
            <button onClick={onTutorial}>
              <PlayCircle size={17} />
              Rever tutorial de primeiro acesso
            </button>
            <a className="button-link secondary" href={guide.pdfUrl} download>
              <Download size={16} />
              Baixar manual em PDF
            </a>
          </div>
        </div>
        <div className="help-document">
          <FileIllustration />
          <b>Manual de treinamento</b>
          <small>
            Versão {guide.version} · {guide.updatedAt}
          </small>
        </div>
      </section>
      <section className="help-profile">
        <span>
          <CheckCircle2 size={20} />
        </span>
        <div>
          <b>Seu perfil: {roleNames[user.role]}</b>
          <p>
            {roleDescriptions[user.role]} Os menus e as ações disponíveis seguem
            essas permissões.
          </p>
        </div>
      </section>
      <div className="help-search">
        <label>
          <Search size={19} />
          <input
            aria-label="Pesquisar no manual"
            type="search"
            placeholder="Procure por senha, cadastro, agenda, ordens…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div className="help-categories">
          {["Todas", ...new Set(guide.topics.map((t) => t.category))].map(
            (c) => (
              <button
                className={category === c ? "active" : ""}
                onClick={() => setCategory(c)}
                key={c}
              >
                {c}
              </button>
            ),
          )}
        </div>
      </div>
      <div className="help-topics">
        {topics.map((t) => (
          <details className="panel help-topic" key={t.id}>
            <summary>
              <span className="help-topic-icon">
                <BookOpen size={19} />
              </span>
              <span>
                <b>{t.title}</b>
                <small>{t.summary}</small>
              </span>
              <span className="help-topic-plus">+</span>
            </summary>
            <div className="help-topic-body">
              <ol>
                {t.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <div className="help-reminders">
                {t.tips.map((tip) => (
                  <p key={tip}>
                    <CheckCircle2 size={15} />
                    <span>{tip}</span>
                  </p>
                ))}
              </div>
              <p className="help-exercise">
                <strong>Para treinar:</strong> {t.exercise}
              </p>
              {allowed.has(t.module as ModuleId) && (
                <button
                  className="secondary small"
                  onClick={() => onNavigate(t.module as ModuleId)}
                >
                  Abrir esta área
                  <ArrowUpRight size={14} />
                </button>
              )}
            </div>
          </details>
        ))}
      </div>
      {!topics.length && (
        <p className="empty-state">
          Nenhum procedimento encontrado. Tente outra palavra ou categoria.
        </p>
      )}
      <section className="browser-tip">
        <MonitorSmartphone size={25} />
        <div>
          <h3>Leve o PCM com você</h3>
          <p>
            No navegador, salve o endereço nos favoritos. No celular, use a
            opção de adicionar à tela inicial, quando disponível. O atalho usa a
            nova identidade PCM.
          </p>
        </div>
        <a href="/brand/pcm-logo-original.png" download className="text-button">
          Baixar logo
          <Download size={15} />
        </a>
      </section>
    </>
  );
}
function FileIllustration() {
  return (
    <div className="file-illustration">
      <span />
      <span />
      <span />
      <BookOpen size={27} />
      <em>PDF</em>
    </div>
  );
}
