import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
const root = fileURLToPath(new URL("../", import.meta.url)),
  guide = JSON.parse(
    fs.readFileSync(path.join(root, "training/guide.json"), "utf8"),
  ),
  out = path.join(root, "frontend/public/docs/manual-pcm-intelligence.pdf");
fs.mkdirSync(path.dirname(out), { recursive: true });
const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    bufferPages: true,
    info: {
      Title: "PCM Intelligence — " + guide.title,
      Author: "PCM Intelligence",
      Subject: "Treinamento de usuários e rotinas de manutenção",
      Keywords: "PCM, manutenção, treinamento, manual",
      CreationDate: new Date("2026-11-18T12:00:00Z"),
      ModDate: new Date("2026-11-18T12:00:00Z"),
    },
  }),
  stream = fs.createWriteStream(out);
doc.pipe(stream);
doc.registerFont(
  "PCM-Regular",
  path.join(root, "training/fonts/DejaVuSans.ttf"),
);
doc.registerFont(
  "PCM-Bold",
  path.join(root, "training/fonts/DejaVuSans-Bold.ttf"),
);
const navy = "#102b3f",
  green = "#138d7b",
  ink = "#293b4d",
  muted = "#60758a",
  pale = "#eef7f4",
  line = "#dfe7ed",
  width = 499;
function text(content, size = 10, color = ink, options = {}) {
  doc
    .font("PCM-Regular")
    .fontSize(size)
    .fillColor(color)
    .text(content, 48, doc.y, { width, lineGap: 4, ...options });
}
function top(kicker, title, summary) {
  doc.rect(0, 0, 595, 7).fill(green);
  doc.image(path.join(root, "frontend/public/brand/pcm-mark.png"), 48, 30, {
    width: 32,
  });
  doc
    .font("PCM-Bold")
    .fontSize(10)
    .fillColor(navy)
    .text("PCM Intelligence", 92, 40);
  doc.y = 91;
  doc.x = 48;
  text(kicker.toUpperCase(), 8, green);
  doc.moveDown(0.6);
  doc
    .font("PCM-Bold")
    .fontSize(23)
    .fillColor(navy)
    .text(title, { width, lineGap: 3 });
  doc.moveDown(0.5);
  text(summary, 11, muted);
  doc.moveDown(1);
}
function rule() {
  doc
    .moveTo(48, doc.y)
    .lineTo(547, doc.y)
    .lineWidth(0.6)
    .strokeColor(line)
    .stroke();
  doc.moveDown(0.8);
  doc.x = 48;
}
function step(n, content) {
  if (doc.y > 665) doc.addPage();
  const y = doc.y;
  doc.roundedRect(48, y, 23, 23, 6).fill(pale);
  doc
    .font("PCM-Bold")
    .fontSize(9)
    .fillColor(green)
    .text(String(n), 48, y + 7, {
      width: 23,
      align: "center",
      lineBreak: false,
    });
  doc
    .font("PCM-Regular")
    .fontSize(10)
    .fillColor(ink)
    .text(content, 84, y, { width: 463, lineGap: 4 });
  doc.y = Math.max(doc.y, y + 25) + 12;
}
function box(title, content) {
  const y = doc.y;
  doc.font("PCM-Regular").fontSize(9);
  const h = doc.heightOfString(content, { width: 467, lineGap: 4 }) + 44;
  if (y + h > 738) {
    doc.addPage();
    doc.y = 50;
  }
  const start = doc.y;
  doc.roundedRect(48, start, width, h, 8).fill(pale);
  doc
    .font("PCM-Bold")
    .fontSize(10)
    .fillColor(green)
    .text(title, 64, start + 13, { width: 467 });
  doc
    .font("PCM-Regular")
    .fontSize(9)
    .fillColor(ink)
    .text(content, 64, start + 32, { width: 467, lineGap: 4 });
  doc.y = start + h + 16;
}
// Capa: instruções genéricas, sem usuários, credenciais ou registros da operação.
doc.rect(0, 0, 595, 842).fill(navy);
doc.circle(570, 85, 170).fill("#163b51");
doc.circle(520, 110, 95).fill("#1a4a5a");
doc.roundedRect(48, 54, 94, 94, 20).fill("#f3faf8");
doc.image(path.join(root, "frontend/public/brand/pcm-mark.png"), 55, 61, {
  width: 80,
});
doc
  .font("PCM-Bold")
  .fontSize(18)
  .fillColor("#ffffff")
  .text("PCM Intelligence", 48, 182, { characterSpacing: 0 });
doc
  .fontSize(37)
  .text("Manual de uso\ne treinamento", 48, 247, { width: 490, lineGap: 7 });
doc
  .font("PCM-Regular")
  .fontSize(14)
  .fillColor("#b9d3dc")
  .text(guide.subtitle, 48, 373, { width: 475, lineGap: 5 });
doc.moveTo(48, 451).lineTo(547, 451).strokeColor("#416271").stroke();
doc
  .font("PCM-Regular")
  .fontSize(11)
  .fillColor("#d1e3e8")
  .text(
    "Versão " + guide.version + "  |  Atualizado em " + guide.updatedAt,
    48,
    475,
  );
doc
  .fontSize(12)
  .fillColor("#6bd2bb")
  .text(guide.publicUrl, 48, 510, { link: guide.publicUrl, underline: true });
doc
  .fontSize(10)
  .fillColor("#b9d3dc")
  .text(
    "Material para administradores, gestores, planejadores, técnicos e usuários de consulta.",
    48,
    566,
    { width: 450, lineGap: 5 },
  );
doc.text(
  "Os exemplos são didáticos. As permissões e os registros disponíveis determinam as ações de cada usuário.",
  48,
  624,
  { width: 450, lineGap: 5 },
);
doc.addPage();
top(
  "Roteiro de treinamento",
  "Comece por aqui",
  "Siga a sequência abaixo e use o índice para consultar uma rotina específica.",
);
step(1, "Entre, troque a senha temporária e conheça as seções do cabeçalho.");
step(
  2,
  "Entenda seu perfil e a diferença entre usuário, técnico, setor e equipamento.",
);
step(
  3,
  "Pratique o ciclo: OS ou plano → reserva na agenda → execução → histórico.",
);
step(
  4,
  "Consulte alertas, indicadores e relatórios. Revise os dados antes de decidir.",
);
rule();
doc
  .font("PCM-Bold")
  .fontSize(12)
  .fillColor(navy)
  .text("Índice de procedimentos");
doc.moveDown(0.7);
guide.topics.forEach((t, i) => {
  text(String(i + 1).padStart(2, "0") + "  " + t.title, 10, ink);
  doc.moveDown(0.25);
});
doc.addPage();
top(
  "Perfis e responsabilidades",
  "Cada pessoa tem seu acesso",
  "Escolha o perfil conforme a responsabilidade da pessoa. A administração de contas pertence ao administrador.",
);
for (const r of guide.roles) {
  doc.font("PCM-Bold").fontSize(12).fillColor(green).text(r.name);
  doc.moveDown(0.25);
  text(r.use, 10);
  text(r.limit, 9, muted);
  doc.moveDown(1);
}
box(
  "Antes de praticar",
  "Use um ambiente de treinamento autorizado para criar exemplos. Não conclua, cancele ou altere registros reais apenas para aprender a interface.",
);
for (let i = 0; i < guide.topics.length; i++) {
  const t = guide.topics[i];
  doc.addPage();
  top(t.category, String(i + 1).padStart(2, "0") + " · " + t.title, t.summary);
  t.steps.forEach((s, n) => step(n + 1, s));
  if (t.tips.length) {
    rule();
    doc.font("PCM-Bold").fontSize(11).fillColor(green).text("Para lembrar");
    doc.moveDown(0.4);
    for (const tip of t.tips) {
      text("• " + tip, 9, muted);
      doc.moveDown(0.4);
    }
  }
  doc.moveDown(0.5);
  box("Exercício de treinamento", t.exercise);
}
doc.addPage();
top(
  "Encerramento",
  "Checklist de aprendizagem",
  "Use esta página para orientar o treinamento de um novo integrante.",
);
[
  "Consigo entrar e sei como pedir redefinição de senha.",
  "Localizo Início, Dashboard e as seções do menu.",
  "Entendo meu perfil e os limites das minhas ações.",
  "Diferencio usuário de técnico e programação de vencimento.",
  "Sei conferir disponibilidade antes de reservar um horário.",
  "Diferencio conclusão de etapa e encerramento da manutenção.",
  "Consigo localizar alertas, histórico e material de ajuda.",
].forEach((x, i) => step(i + 1, x));
box(
  "Onde encontrar ajuda",
  "Abra Suporte → Central de ajuda para pesquisar procedimentos, rever o tutorial ou baixar a versão atual deste manual.",
);
text("Participante: ______________________________________________", 11);
doc.moveDown(1);
text("Responsável pelo treinamento: _______________________________", 11);
doc.moveDown(1);
text("Data: ____ / ____ / ______", 11);
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  if (i === 0) continue;
  doc.save();
  doc
    .moveTo(48, 776)
    .lineTo(547, 776)
    .lineWidth(0.5)
    .strokeColor(line)
    .stroke();
  doc
    .font("PCM-Regular")
    .fontSize(8)
    .fillColor(muted)
    .text(
      "PCM Intelligence · Manual de treinamento · v" + guide.version,
      48,
      783,
      { lineBreak: false, height: 12 },
    );
  doc.text(String(i + 1) + " / " + range.count, 500, 783, {
    width: 47,
    align: "right",
    lineBreak: false,
    height: 12,
  });
  doc.restore();
}
doc.end();
await new Promise((resolve, reject) => {
  stream.on("finish", resolve);
  stream.on("error", reject);
});
console.log(
  JSON.stringify({
    manual: path.relative(root, out),
    pages: range.count,
    bytes: fs.statSync(out).size,
  }),
);
