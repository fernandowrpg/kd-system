/**
 * A Lenda do Dragão de Fogo (Karyu Densetsu) — sistema não oficial para Foundry VTT v13/v14.
 */
import { LENDA, SYSTEM_ID } from "./config.mjs";
import * as atorModelos from "./data/actor.mjs";
import * as itemModelos from "./data/item.mjs";
import { LendaActor } from "./documents/actor.mjs";
import { LendaItem } from "./documents/item.mjs";
import { LendaChatMessage } from "./dice/chat.mjs";
import { ProtagonistaSheet, AntagonistaSheet, CoadjuvanteSheet, EspiritoSheet } from "./sheets/actor-sheet.mjs";
import { LendaItemSheet } from "./sheets/item-sheet.mjs";
import * as dice from "./dice/teste.mjs";
import * as tensao from "./helpers/tensao.mjs";
import { registrarHelpers, precarregarTemplates } from "./helpers/handlebars.mjs";
import { registrarConfiguracoes } from "./helpers/settings.mjs";
import { verificarRequisitos } from "./helpers/requisitos.mjs";

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Inicializando A Lenda do Dragão de Fogo`);

  CONFIG.LENDA = LENDA;
  game.lenda = {
    config: LENDA,
    dice,
    tensao,
    verificarRequisitos,
    usarTecnica: macroUsarTecnica,
    abrirAssistente: async (actor) => {
      const { AssistenteCriacao } = await import("./apps/assistente.mjs");
      return new AssistenteCriacao({ document: actor }).render(true);
    }
  };

  // Documentos.
  CONFIG.Actor.documentClass = LendaActor;
  CONFIG.Item.documentClass = LendaItem;
  CONFIG.ChatMessage.documentClass = LendaChatMessage;

  // Modelos de dados.
  Object.assign(CONFIG.Actor.dataModels, {
    protagonista: atorModelos.ProtagonistaData,
    antagonista: atorModelos.AntagonistaData,
    coadjuvante: atorModelos.CoadjuvanteData,
    espirito: atorModelos.EspiritoData
  });
  Object.assign(CONFIG.Item.dataModels, {
    tecnica: itemModelos.TecnicaData,
    trunfo: itemModelos.TrunfoData,
    caminho: itemModelos.CaminhoData,
    estilo: itemModelos.EstiloData,
    equipamento: itemModelos.EquipamentoData,
    upgrade: itemModelos.UpgradeData
  });

  // Atributos rastreáveis para barras de token.
  CONFIG.Actor.trackableAttributes = {
    protagonista: { bar: ["vigor"], value: ["sincronizacao.value", "aura", "karma.value", "nagen.rodada"] },
    antagonista: { bar: ["vigor"], value: ["sincronizacao.value", "aura", "nagen.rodada"] },
    coadjuvante: { bar: ["vigor"], value: ["aura", "grupo.tamanho"] },
    espirito: { bar: ["reserva"], value: ["aura"] }
  };

  // Iniciativa: maior Agilidade; Instinto desempata; dado como último critério.
  CONFIG.Combat.initiative = { formula: "@atributos.agilidade + @atributos.instinto / 10 + 1d6 / 100", decimals: 2 };

  // Fichas.
  const DocumentSheetConfig = foundry.applications.apps.DocumentSheetConfig;
  DocumentSheetConfig.unregisterSheet(Actor, "core", foundry.appv1.sheets.ActorSheet);
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, ProtagonistaSheet, { types: ["protagonista"], makeDefault: true, label: "LENDA.Ficha.Protagonista" });
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, AntagonistaSheet, { types: ["antagonista"], makeDefault: true, label: "LENDA.Ficha.Antagonista" });
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, CoadjuvanteSheet, { types: ["coadjuvante"], makeDefault: true, label: "LENDA.Ficha.Coadjuvante" });
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, EspiritoSheet, { types: ["espirito"], makeDefault: true, label: "LENDA.Ficha.Espirito" });
  DocumentSheetConfig.unregisterSheet(Item, "core", foundry.appv1.sheets.ItemSheet);
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, LendaItemSheet, { makeDefault: true, label: "LENDA.Ficha.Item" });

  registrarConfiguracoes();
  registrarHelpers();
  precarregarTemplates();
});

Hooks.once("ready", () => {
  tensao.registrarSocket();
  tensao.renderizarPainelTensao();
});

/* -------------------------------------------- */
/*  Combate: o nagen canalizado zera a cada rodada */
/* -------------------------------------------- */

Hooks.on("updateCombat", async (combat, changes) => {
  if (!("round" in changes) || !tensao.souNarradorAtivo()) return;
  if (!game.settings.get(SYSTEM_ID, "zerarNagenRodada")) return;
  for (const c of combat.combatants) {
    if (c.actor?.system?.nagen?.rodada) await c.actor.novaRodada();
  }
});

Hooks.on("deleteCombat", async (combat) => {
  if (!tensao.souNarradorAtivo()) return;
  for (const c of combat.combatants) {
    if (c.actor?.system?.nagen?.rodada) await c.actor.novaRodada();
  }
});

/* -------------------------------------------- */
/*  Macros: arrastar técnicas para a barra       */
/* -------------------------------------------- */

Hooks.on("hotbarDrop", (bar, data, slot) => {
  if (data.type !== "Item") return;
  criarMacroTecnica(data, slot);
  return false;
});

async function criarMacroTecnica(data, slot) {
  const item = await fromUuid(data.uuid);
  if (!item || item.type !== "tecnica" || !item.parent) return;
  const command = `game.lenda.usarTecnica(${JSON.stringify(item.name)});`;
  let macro = game.macros.find(m => m.name === item.name && m.command === command);
  if (!macro) {
    macro = await Macro.create({ name: item.name, type: "script", img: item.img, command, flags: { [SYSTEM_ID]: { tecnica: true } } });
  }
  return game.user.assignHotbarMacro(macro, slot);
}

/**
 * Usa uma técnica do personagem controlado (ou atribuído ao usuário).
 * @param {string} nome
 */
function macroUsarTecnica(nome) {
  const speaker = ChatMessage.getSpeaker();
  const actor = (speaker.token ? game.actors.tokens[speaker.token] : null) ?? game.actors.get(speaker.actor) ?? game.user.character;
  const item = actor?.items.find(i => i.type === "tecnica" && i.name === nome);
  if (!item) return ui.notifications.warn(game.i18n.format("LENDA.Aviso.TecnicaNaoEncontrada", { nome }));
  return dice.usarTecnica(actor, item);
}

/* -------------------------------------------- */
/*  Atualizações visuais                          */
/* -------------------------------------------- */

Hooks.on("renderActorDirectory", (app, html) => {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(".lenda-diretorio")) return;
  const footer = root.querySelector(".directory-footer") ?? root.querySelector("footer");
  if (!footer) return;
  const div = document.createElement("div");
  div.classList.add("lenda-diretorio");
  div.innerHTML = `<button type="button" data-lenda="guia"><i class="fas fa-book-open"></i> ${game.i18n.localize("LENDA.Guia.Abrir")}</button>`;
  div.querySelector("button").addEventListener("click", async () => {
    const pack = game.packs.get(`${SYSTEM_ID}.regras`);
    const idx = await pack?.getIndex();
    const entry = idx?.find(e => e.name.startsWith("Passo a Passo"));
    if (entry) (await pack.getDocument(entry._id))?.sheet.render(true);
  });
  footer.append(div);
});
