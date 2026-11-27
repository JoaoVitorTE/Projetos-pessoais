import { useEffect, useRef, useId, type ReactNode } from "react";
import type { Lookups } from "../types/operations";
import { priorities, statusLabel, equipmentCode } from "../types/operations";
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="modal"
    >
      <div className="modal-top">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon"
          aria-label="Fechar"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function State({
  error,
  loading,
}: {
  error?: string;
  loading?: boolean;
}) {
  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="muted" role="status">
          Carregando registros…
        </p>
      )}
    </>
  );
}
export function Badge({ status }: { status: string }) {
  return (
    <span className={"status-badge status-" + status.toLowerCase()}>
      {statusLabel[status] || status}
    </span>
  );
}
export function Priority({ value }: { value: number }) {
  return (
    <span className={"priority priority-" + value}>{priorities[value]}</span>
  );
}
export function Pager({
  page,
  pages,
  total,
  onChange,
}: {
  page: number;
  pages: number;
  total: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="pager">
      <span>
        {total} registros · Página {page} de {pages}
      </span>
      <button
        className="secondary"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Anterior
      </button>
      <button
        className="secondary"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}
export type FleetFilter = {
  sectorId: string;
  equipmentId: string;
  criticality: string;
};
export function FleetFilters({
  value,
  onChange,
  lookups,
  showSector = true,
}: {
  showSector?: boolean;
  value: FleetFilter;
  onChange: (v: FleetFilter) => void;
  lookups: Lookups;
}) {
  return (
    <>
      {showSector && (
        <label>
          Setor
          <select
            aria-label="Setor"
            value={value.sectorId}
            onChange={(e) =>
              onChange({ ...value, sectorId: e.target.value, equipmentId: "" })
            }
          >
            <option value="">Todos os setores</option>
            {lookups.sectors.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Equipamento
        <select
          aria-label="Equipamento"
          value={value.equipmentId}
          onChange={(e) => onChange({ ...value, equipmentId: e.target.value })}
        >
          <option value="">Todos os equipamentos</option>
          {lookups.equipment
            .filter((x) => !value.sectorId || x.sectorId === value.sectorId)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {equipmentCode(x)} ·{" "}
                {x.sectorId &&
                  lookups.sectors.find((s) => s.id === x.sectorId)?.name}{" "}
                · {x.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Criticidade
        <select
          aria-label="Criticidade"
          value={value.criticality}
          onChange={(e) => onChange({ ...value, criticality: e.target.value })}
        >
          <option value="">Todas</option>
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {priorities[n]}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
export function EquipmentSelect({
  lookups,
  value,
  onChange,
}: {
  lookups: Lookups;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label>
      Equipamento
      <select
        aria-label="Equipamento"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Selecione</option>
        {lookups.equipment.map((x) => (
          <option key={x.id} value={x.id}>
            {equipmentCode(x)} ·{" "}
            {x.sectorId &&
              lookups.sectors.find((s) => s.id === x.sectorId)?.name}{" "}
            · {x.name}
          </option>
        ))}
      </select>
    </label>
  );
}
export function TechnicianSelect({
  lookups,
  value,
  onChange,
  optional = false,
}: {
  lookups: Lookups;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
}) {
  return (
    <label>
      Técnico responsável
      <select
        aria-label="Técnico responsável"
        required={!optional}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{optional ? "Sem responsável" : "Selecione"}</option>
        {lookups.technicians
          .filter((x) => x.active || x.id === value)
          .map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} · {x.specialty}
              {!x.active ? " (inativo)" : ""}
            </option>
          ))}
      </select>
    </label>
  );
}
export const emptyFleet: FleetFilter = {
  sectorId: "",
  equipmentId: "",
  criticality: "",
};
export function Empty() {
  return (
    <p className="empty-state">Nenhum registro encontrado com esses filtros.</p>
  );
}
