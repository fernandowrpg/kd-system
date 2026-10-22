import { LENDA, SYSTEM_ID } from "../config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const loc = k => game.i18n.localize(k);

/**
 * Ficha de item genérica: cada tipo tem seu próprio template de detalhes.
 */
export class LendaItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["lenda", "sheet", "item"],
    position: { width: 580, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      tab: LendaItemSheet.#onTab,
      eventoAdicionar: LendaItemSheet.#onEventoAdicionar,
      eventoRemover: LendaItemSheet.#onEventoRemover,
      paraChat: LendaItemSheet.#onParaChat
    }
  };

  static PARTS = {
    header: { template: `systems/${SYSTEM_ID}/templates/item/header.hbs` },
    body: { template: `systems/${SYSTEM_ID}/templates/item/body.hbs`, scrollable: [".aba-corpo"] }
  };

  tabGroups = { primary: "detalhes" };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const s = item.system;
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    const enrich = html => TextEditor.enrichHTML(html ?? "", { relativeTo: item, secrets: item.isOwner, rollData: item.getRollData() });
    const ativa = this.tabGroups.primary;
    Object.assign(context, {
      item,
      system: s,
      config: LENDA,
      editable: this.isEditable,
      tipoNome: loc(`TYPES.Item.${item.type}`),
      template: `systems/${SYSTEM_ID}/templates/item/${item.type}.hbs`,
      abas: [
        { id: "detalhes", label: loc("LENDA.Aba.Detalhes"), active: ativa === "detalhes" },
        { id: "descricao", label: loc("LENDA.Aba.Descricao"), active: ativa === "descricao" }
      ],
      aba: { detalhes: ativa === "detalhes" ? "active" : "", descricao: ativa === "descricao" ? "active" : "" },
      enriched: { descricao: await enrich(s.descricao) }
    });

    if (item.type === "tecnica") {
      context.enriched.ougi = await enrich(s.ougi);
      context.enriched.sincronizacao = await enrich(s.sincronizacao);
      context.tipos = Object.entries(LENDA.estilo).map(([k, v]) => ({ key: k, label: loc(v.label), checked: s.tipos.includes(k) }));
      context.upgrades = Object.entries(LENDA.upgrades).map(([k, v]) => ({ key: k, label: loc(v.label), hint: loc(v.hint), checked: s.upgrades.includes(k) }));
      context.elementos = Object.fromEntries(Object.entries(LENDA.elementos).map(([k, v]) => [k, loc(v)]));
      context.acoes = Object.fromEntries(Object.entries(LENDA.acoes).map(([k, v]) => [k, loc(v)]));
      context.atributosAbrev = Object.fromEntries(Object.values(LENDA.atributos).map(v => [v.short, loc(v.label)]));
      if (item.actor && s.ataque.dano) {
        const { avaliarFormula } = await import("../dice/teste.mjs");
        context.danoAtual = avaliarFormula(s.ataque.dano, item.actor.getRollData());
      }
    } else if (item.type === "equipamento") {
      context.categorias = Object.fromEntries(Object.entries(LENDA.categoriasEquipamento).map(([k, v]) => [k, loc(v)]));
      context.caracteristicas = Object.entries(LENDA.caracteristicas).map(([k, v]) => ({ key: k, label: loc(v.label), hint: loc(v.hint), checked: s.caracteristicas.includes(k) }));
    } else if (item.type === "trunfo") {
      context.afinidades = Object.fromEntries(Object.entries(LENDA.afinidades).map(([k, v]) => [k, loc(v)]));
      context.elementos = Object.fromEntries(Object.entries(LENDA.elementos).filter(([k]) => ["", "agua", "ar", "fogo", "terra"].includes(k)).map(([k, v]) => [k, loc(v)]));
    } else if (item.type === "estilo") {
      context.valores = Object.entries(LENDA.estilo).map(([k, v]) => ({ key: k, label: loc(v.label), value: s.valores[k] }));
      context.ougisTexto = s.ougis.join(", ");
      context.totalEstilo = Object.values(s.valores).reduce((a, b) => a + b, 0);
    } else if (item.type === "caminho") {
      context.eventos = s.eventos.map((e, i) => ({ ...e, indice: i }));
    } else if (item.type === "upgrade") {
      context.chaves = Object.fromEntries(Object.entries(LENDA.upgrades).map(([k, v]) => [k, loc(v.label)]));
    }
    return context;
  }

  /** @override */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const item = this.document;
    // Conjuntos de caixas de seleção → arrays.
    const conjuntos = { tecnica: ["tipos", "upgrades"], equipamento: ["caracteristicas"] }[item.type] ?? [];
    for (const campo of conjuntos) {
      const valor = foundry.utils.getProperty(data, `system.${campo}`);
      if (valor && !Array.isArray(valor)) {
        foundry.utils.setProperty(data, `system.${campo}`, Object.entries(valor).filter(([, v]) => v).map(([k]) => k));
      }
    }
    if (item.type === "caminho") {
      const ev = foundry.utils.getProperty(data, "system.eventos");
      if (ev && !Array.isArray(ev)) {
        const atual = foundry.utils.deepClone(item.system.eventos);
        for (const [i, v] of Object.entries(ev)) atual[Number(i)] = { ...(atual[Number(i)] ?? {}), ...v };
        foundry.utils.setProperty(data, "system.eventos", atual);
      }
    }
    if (item.type === "estilo") {
      const t = foundry.utils.getProperty(data, "ougisTexto");
      if (t !== undefined) {
        foundry.utils.setProperty(data, "system.ougis", String(t).split(",").map(x => x.trim()).filter(Boolean));
        delete data.ougisTexto;
      }
    }
    return data;
  }

  static #onTab(event, target) {
    const tab = target.dataset.tab;
    this.tabGroups.primary = tab;
    for (const el of this.element.querySelectorAll("[data-group='primary']")) el.classList.toggle("active", el.dataset.tab === tab);
  }

  static #onEventoAdicionar() {
    const ev = foundry.utils.deepClone(this.document.system.eventos);
    ev.push({ texto: "", marcado: false });
    return this.document.update({ "system.eventos": ev });
  }

  static #onEventoRemover(event, target) {
    const ev = foundry.utils.deepClone(this.document.system.eventos);
    ev.splice(Number(target.dataset.indice), 1);
    return this.document.update({ "system.eventos": ev });
  }

  static #onParaChat() {
    return this.document.paraChat();
  }
}
