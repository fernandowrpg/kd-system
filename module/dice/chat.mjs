import { LENDA, SYSTEM_ID } from "../config.mjs";
import { SOCKET } from "../helpers/tensao.mjs";

const { DialogV2 } = foundry.applications.api;
const loc = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/**
 * Mensagem de chat com os botões interativos do sistema.
 */
export class LendaChatMessage extends ChatMessage {
  /** @override */
  async renderHTML(options = {}) {
    const html = await super.renderHTML(options);
    if (this.flags?.[SYSTEM_ID]) ativarBotoes(this, html);
    return html;
  }
}

/**
 * Liga os botões de um cartão de chat.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function ativarBotoes(message, html) {
  const flags = message.flags[SYSTEM_ID];
  for (const btn of html.querySelectorAll("[data-lenda-acao]")) {
    btn.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      onAcao(message, btn.dataset.lendaAcao, btn.dataset, ev).catch(err => console.error(`${SYSTEM_ID} |`, err));
    });
  }
  // Esconde controles que o usuário não pode usar.
  const ator = flags.actorUuid ? fromUuidSync(flags.actorUuid) : null;
  const dono = game.user.isGM || ator?.isOwner;
  if (!dono) html.querySelectorAll(".somente-atacante").forEach(el => el.remove());
  for (const el of html.querySelectorAll("[data-alvo-dono]")) {
    const alvo = fromUuidSync(el.dataset.alvoDono);
    const a = alvo?.actor ?? alvo;
    if (!game.user.isGM && !a?.isOwner) el.remove();
  }
}

async function onAcao(message, acao, dataset) {
  switch (acao) {
    case "aplicar": return aplicarAtaque(message, dataset.alvo, {});
    case "aplicar-bloqueio": return aplicarComBloqueio(message, dataset.alvo);
    case "aplicar-vigor": return aplicarAtaque(message, dataset.alvo, { soVigor: true });
    case "defesa": {
      const alvo = await fromUuid(dataset.alvo);
      const ator = alvo?.actor ?? alvo;
      if (!ator?.isOwner) return;
      const { defesaTotal } = await import("./teste.mjs");
      return defesaTotal(ator, dataset.tipo);
    }
    case "splash": return escolherSplash(message, dataset.efeito);
  }
}

/** Atualiza o contexto salvo da mensagem e redesenha o conteúdo. */
async function redesenhar(message, mutador) {
  const flags = foundry.utils.deepClone(message.flags[SYSTEM_ID]);
  if (!flags.ctx) return;
  mutador(flags);
  const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/chat/teste.hbs`, flags.ctx);
  if (message.canUserModify(game.user, "update")) {
    return message.update({ content, [`flags.${SYSTEM_ID}`]: flags });
  }
}

/**
 * Aplica o ataque a um alvo.
 */
async function aplicarAtaque(message, alvoUuid, { protecao = null, soVigor = false } = {}) {
  const flags = message.flags[SYSTEM_ID];
  const ataque = flags.ctx?.ataque ?? flags.ataque;
  if (!ataque) return;
  const alvoCtx = flags.ctx?.alvos?.find(a => a.uuid === alvoUuid);
  if (alvoCtx?.aplicado) {
    const ok = await DialogV2.confirm({ window: { title: loc("LENDA.Chat.JaAplicadoTitulo") }, content: `<p>${loc("LENDA.Chat.JaAplicado")}</p>` });
    if (!ok) return;
  }
  const dados = {
    dano: soVigor ? -999 : ataque.dano,
    vigor: alvoCtx ? alvoCtx.vigorBase ?? ataque.vigor : ataque.vigor,
    elemento: ataque.elemento,
    penetracao: ataque.penetracao ?? 0,
    protecao,
    ignorarBonusProtecao: !!ataque.ignorarBonusProtecao
  };
  const doc = await fromUuid(alvoUuid);
  const ator = doc?.actor ?? doc;
  if (!ator) return ui.notifications.warn(loc("LENDA.Aviso.AlvoNaoEncontrado"));
  if (ator.isOwner) {
    const resumo = await ator.sofrerAtaque(dados);
    await anunciarResultadoAtaque(ator, resumo);
  } else {
    if (!game.users.activeGM) return ui.notifications.warn(loc("LENDA.Aviso.SemNarrador"));
    game.socket.emit(SOCKET, { acao: "atacar", alvo: alvoUuid, dados });
  }
  await redesenhar(message, f => {
    const a = f.ctx.alvos.find(x => x.uuid === alvoUuid);
    if (a) a.aplicado = true;
  });
}

async function aplicarComBloqueio(message, alvoUuid) {
  const flags = message.flags[SYSTEM_ID];
  const alvoCtx = flags.ctx?.alvos?.find(a => a.uuid === alvoUuid);
  const valor = await DialogV2.prompt({
    window: { title: loc("LENDA.Chat.BloqueioTitulo") },
    content: `<div class="form-group"><label>${loc("LENDA.Chat.NovoLP")}</label><input type="number" name="lp" value="${alvoCtx?.lp ?? 0}" autofocus></div>`,
    ok: { label: loc("LENDA.Chat.Aplicar"), callback: (event, button) => Number(button.form.elements.lp.value) },
    rejectClose: false
  });
  if (valor === null || valor === undefined || Number.isNaN(valor)) return;
  return aplicarAtaque(message, alvoUuid, { protecao: valor });
}

/**
 * Escolhe o efeito de splash do ataque.
 */
async function escolherSplash(message, efeito) {
  const flags = message.flags[SYSTEM_ID];
  const ctx = flags.ctx;
  if (!ctx?.ataque || ctx.splashEscolhido) return;
  const ator = await fromUuid(flags.actorUuid);
  if (!ator?.isOwner) return;
  if (efeito !== "sincronizacao") {
    if ((ator.system.sincronizacao?.value ?? 0) < 1) return ui.notifications.warn(loc("LENDA.Aviso.SemSincronizacao"));
    await ator.ajustarSincronizacao(-1);
  } else if (ator.type === "protagonista") {
    await ator.ajustarSincronizacao(1);
  }
  await redesenhar(message, f => {
    f.ctx.splashEscolhido = loc(LENDA.splash[efeito].label);
    f.ctx.splashTexto = loc(LENDA.splash[efeito].hint);
    if (efeito === "decisivo") {
      f.ctx.ataque.dano += 5;
      for (const a of f.ctx.alvos) a.fere = a.acerto && f.ctx.ataque.dano > a.lp;
    }
  });
}

/**
 * Publica o resultado da aplicação de um ataque.
 */
export async function anunciarResultadoAtaque(ator, resumo) {
  const partes = [];
  partes.push(loc("LENDA.Chat.PerdeuVigor", { n: resumo.vigor }));
  if (resumo.fraco) partes.push(loc("LENDA.Chat.ElementoOposto"));
  if (resumo.auraDissipada) partes.push(loc("LENDA.Chat.AuraDissipada"));
  if (resumo.membroRemovido) partes.push(loc("LENDA.Chat.MembroRemovido"));
  if (resumo.auraReduzida) partes.push(loc("LENDA.Chat.AuraEspiritoReduzida"));
  if (resumo.ferimentos) partes.push(loc("LENDA.Chat.Ferido", { n: resumo.ferimentos }));
  if (resumo.derrotado) partes.push(`<strong>${loc("LENDA.Chat.Derrotado")}</strong>`);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: ator }),
    content: `<div class="lenda-chat resultado-ataque"><p><strong>${ator.name}</strong>: ${partes.join(" ")}</p></div>`,
    whisper: ator.hasPlayerOwner ? [] : ChatMessage.getWhisperRecipients("GM").map(u => u.id)
  });
}
