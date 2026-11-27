---
version: alpha
name: PCM Intelligence
description: Interface de planejamento e controle da manutenção industrial.
colors:
  navigation: "#165a9f"
  action: "#08715e"
  surface: "#ffffff"
  background: "#edf2f4"
  rail: "#f8fbfc"
  hero: "#081d2b"
  hero-action: "#a3e5ce"
  dark-surface: "#192a36"
  dark-background: "#101c25"
typography:
  display:
    fontFamily: "Barlow Semi Condensed, Segoe UI, system-ui, sans-serif"
  sans:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
rounded:
  lg: "18px"
components:
  button: {}
  card: {}
  dialog: {}
---

# Design do PCM Intelligence

A referência visual é o quadro de turno de uma oficina industrial. A página inicial coloca ordens e agenda lado a lado, com indicadores abaixo e prioridades em uma lista curta. A fotografia da fábrica une a página de acesso e o painel. O azul-petróleo da fotografia contrasta com o verde mineral da ação principal. A agenda registra a data no fuso operacional, com horários alinhados para leitura rápida. A barra lateral e as superfícies de trabalho usam fundos sólidos e filetes discretos.

Barlow Semi Condensed distingue títulos e números. Campos, descrições e tabelas usam a família de leitura do app. O azul indica navegação e foco, o verde indica ação e disponibilidade. Âmbar e vermelho são reservados para avisos e situações críticas.

A fonte de verdade dos tokens é o CSS do frontend. `styles.css` define `--blue`, `--green`, `--heading-font`, `--warning-ink` e `--critical-ink`, com cores por tema. `experience.css` define `--radius` e os componentes compartilhados. `visual.css` define as superfícies da navegação e do painel fotográfico, aplica o layout e as transições nos temas. As regras de movimento respeitam a preferência do sistema.
