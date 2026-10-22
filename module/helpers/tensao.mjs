import { SYSTEM_ID } from "../config.mjs";

export const SOCKET = `system.${SYSTEM_ID}`;

/** O cliente atual é o narrador responsável por processar pedidos de socket? */
export function souNarradorAtivo() {
  const gm = game.users.activeGM;
  return !!gm && gm.isSelf;
}

/**
 * Ajusta a Tensão. Jogadores enviam o pedido ao narrador ativo via socket.
 * @param {number} delta
 * @param {object} [opcoes]
 * @param {string} [opcoes.motivo]      Texto exibido no chat.
 * @param {boolean} [opcoes.voluntario] Aumento voluntário do narrador (concede karma).
 * @param {boolean} [opcoes.silencioso] Não cria mensagem no chat.
 */
export async function ajustarTensao(delta, { motivo = "", voluntario = false, silencioso = false } = {}) {
  if (!delta) return;
  if (!game.user.isGM) {
    if (!game.users.activeGM) {
      ui.notifications.warn(game.i18n.localize("LENDA.Aviso.SemNarrador"));
      return;
    }
    game.socket.emit(SOCKET, { acao: "tensao", delta, motivo, voluntario, silencioso, usuario: game.user.id });
    return;
  }
  const atual = game.settings.get(SYSTEM_ID, "tensao");
  const novo = Math.max(0, atual + delta);
  await game.settings.set(SYSTEM_ID, "tensao", novo);
  if (voluntario && delta > 0) await concederKarmaEmCena(delta);
  if (!silencioso && game.settings.get(SYSTEM_ID, "mensagensTensao")) {
    const sinal = delta > 0 ? `+${delta}` : `${delta}`;
    const extra = voluntario && delta > 0 ? `<p class="karma">${game.i18n.localize("LENDA.Tensao.KarmaConcedido")}</p>` : "";
    await ChatMessage.create({
      content: `<div class="lenda-chat tensao-msg"><i class="fas fa-bolt"></i> <strong>${game.i18n.localize("LENDA.Tensao.Nome")} ${sinal}</strong> → ${novo}${motivo ? `<br><span class="motivo">${motivo}</span>` : ""}${extra}</div>`,
      speaker: { alias: game.i18n.localize("LENDA.Tensao.Nome") },
      whisper: game.settings.get(SYSTEM_ID, "tensaoPublica") ? [] : ChatMessage.getWhisperRecipients("GM").map(u => u.id)
    });
  }
}

/** Protagonistas com token na cena ativa ou atribuídos a jogadores ativos. */
export function protagonistasEmCena() {
  const atores = new Set();
  const cena = game.scenes.active ?? canvas?.scene;
  for (const t of cena?.tokens ?? []) if (t.actor?.type === "protagonista") atores.add(t.actor);
  if (!atores.size) {
    for (const u of game.users) if (u.active && !u.isGM && u.character?.type === "protagonista") atores.add(u.character);
  }
  return [...atores];
}

async function concederKarmaEmCena(n) {
  for (const a of protagonistasEmCena()) {
    await a.update({ "system.karma.value": a.system.karma.value + n, "system.karma.total": a.system.karma.total + n });
  }
}

/** Rola a pilha de Tensão (dois maiores; opcionalmente um terceiro, reduzindo a Tensão em 1). */
export async function rolarTensao() {
  const { rolarPilhaTensao } = await import("../dice/teste.mjs");
  return rolarPilhaTensao();
}

/** Nova cena: prepara todos os personagens da cena e os protagonistas dos jogadores. */
export async function novaCena() {
  if (!game.user.isGM) return;
  const atores = new Set(protagonistasEmCena());
  for (const a of game.actors) if (a.type === "protagonista" && a.hasPlayerOwner) atores.add(a);
  const cena = game.scenes.active ?? canvas?.scene;
  for (const t of cena?.tokens ?? []) if (t.actor) atores.add(t.actor);
  for (const a of atores) await a.novaCena();
  await ChatMessage.create({
    content: `<div class="lenda-chat cena-msg"><h3><i class="fas fa-clapperboard"></i> ${game.i18n.localize("LENDA.Cena.Nova")}</h3><p>${game.i18n.localize("LENDA.Cena.NovaDescricao")}</p></div>`,
    speaker: { alias: game.i18n.localize("LENDA.Sistema") }
  });
}

/** Nova sessão: Tensão volta a 2. */
export async function novaSessao() {
  if (!game.user.isGM) return;
  await game.settings.set(SYSTEM_ID, "tensao", 2);
  await ChatMessage.create({
    content: `<div class="lenda-chat cena-msg"><h3><i class="fas fa-book-open"></i> ${game.i18n.localize("LENDA.Sessao.Nova")}</h3><p>${game.i18n.localize("LENDA.Sessao.NovaDescricao")}</p></div>`,
    speaker: { alias: game.i18n.localize("LENDA.Sistema") }
  });
}

/* -------------------------------------------- */
/*  Socket                                       */
/* -------------------------------------------- */

export function registrarSocket() {
  game.socket.on(SOCKET, async (dados) => {
    if (!souNarradorAtivo()) return;
    try {
      switch (dados.acao) {
        case "tensao":
          await ajustarTensao(dados.delta, { motivo: dados.motivo, voluntario: dados.voluntario, silencioso: dados.silencioso });
          break;
        case "atacar": {
          const alvo = await fromUuid(dados.alvo);
          const ator = alvo?.actor ?? alvo;
          if (ator) {
            const resumo = await ator.sofrerAtaque(dados.dados);
            const { anunciarResultadoAtaque } = await import("../dice/chat.mjs");
            await anunciarResultadoAtaque(ator, resumo);
          }
          break;
        }
        case "vigor": {
          const alvo = await fromUuid(dados.alvo);
          const ator = alvo?.actor ?? alvo;
          if (ator) await ator.perderVigor(dados.quantidade);
          break;
        }
      }
    } catch(err) {
      console.error(`${SYSTEM_ID} | Erro ao processar socket`, err);
    }
  });
}

/* -------------------------------------------- */
/*  Painel de Tensão                             */
/* -------------------------------------------- */

let painel = null;

export function renderizarPainelTensao() {
  if (!game.settings.get(SYSTEM_ID, "mostrarPainel")) {
    painel?.remove();
    painel = null;
    return;
  }
  const tensao = game.settings.get(SYSTEM_ID, "tensao");
  if (!painel) {
    painel = document.createElement("section");
    painel.id = "lenda-painel-tensao";
    painel.classList.add("lenda-painel");
    document.body.appendChild(painel);
    painel.addEventListener("click", onClickPainel);
    try {
      const pos = JSON.parse(localStorage.getItem(`${SYSTEM_ID}.painel`) ?? "null");
      if (pos) Object.assign(painel.style, { left: `${pos.left}px`, top: `${pos.top}px`, right: "auto", bottom: "auto" });
    } catch(err) { /* posição padrão */ }
    tornarArrastavel(painel);
  }
  const gm = game.user.isGM;
  const publica = game.settings.get(SYSTEM_ID, "tensaoPublica");
  const i = k => game.i18n.localize(k);
  painel.innerHTML = `
    <header class="arrastar" data-tooltip="${i("LENDA.Tensao.Arrastar")}"><i class="fas fa-bolt"></i> ${i("LENDA.Tensao.Nome")}</header>
    <div class="valor${tensao >= 6 && (gm || publica) ? " alta" : ""}">${gm || publica ? tensao : "?"}</div>
    ${gm ? `
    <div class="botoes">
      <button type="button" data-acao="menos" data-tooltip="${i("LENDA.Tensao.Menos")}"><i class="fas fa-minus"></i></button>
      <button type="button" data-acao="mais" data-tooltip="${i("LENDA.Tensao.Mais")}"><i class="fas fa-plus"></i></button>
      <button type="button" data-acao="voluntario" data-tooltip="${i("LENDA.Tensao.Voluntario")}"><i class="fas fa-plus-circle"></i></button>
      <button type="button" data-acao="rolar" data-tooltip="${i("LENDA.Tensao.Rolar")}"><i class="fas fa-dice"></i></button>
    </div>
    <div class="botoes">
      <button type="button" data-acao="cena" data-tooltip="${i("LENDA.Cena.Nova")}"><i class="fas fa-clapperboard"></i></button>
      <button type="button" data-acao="sessao" data-tooltip="${i("LENDA.Sessao.Nova")}"><i class="fas fa-book-open"></i></button>
    </div>` : ""}`;
}

async function onClickPainel(event) {
  const btn = event.target.closest("button[data-acao]");
  if (!btn || !game.user.isGM) return;
  switch (btn.dataset.acao) {
    case "menos": return ajustarTensao(-1, { silencioso: true });
    case "mais": return ajustarTensao(1, { silencioso: true });
    case "voluntario": return ajustarTensao(1, { motivo: game.i18n.localize("LENDA.Tensao.AumentoVoluntario"), voluntario: true });
    case "rolar": return rolarTensao();
    case "cena": return novaCena();
    case "sessao": return novaSessao();
  }
}

function tornarArrastavel(el) {
  let inicio = null;
  el.addEventListener("pointerdown", ev => {
    if (!ev.target.closest(".arrastar")) return;
    const r = el.getBoundingClientRect();
    inicio = { x: ev.clientX - r.left, y: ev.clientY - r.top };
    el.setPointerCapture(ev.pointerId);
  });
  el.addEventListener("pointermove", ev => {
    if (!inicio) return;
    const left = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, ev.clientX - inicio.x));
    const top = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, ev.clientY - inicio.y));
    Object.assign(el.style, { left: `${left}px`, top: `${top}px`, right: "auto", bottom: "auto" });
  });
  el.addEventListener("pointerup", ev => {
    if (!inicio) return;
    inicio = null;
    const r = el.getBoundingClientRect();
    localStorage.setItem(`${SYSTEM_ID}.painel`, JSON.stringify({ left: r.left, top: r.top }));
  });
}
