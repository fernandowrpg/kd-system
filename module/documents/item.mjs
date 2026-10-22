import { LENDA, SYSTEM_ID } from "../config.mjs";

/**
 * Documento de Item do sistema.
 */
export class LendaItem extends Item {

  /** @override */
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    if (!data.img || data.img === "icons/svg/item-bag.svg") {
      const img = LENDA.defaultIcons[this.type];
      if (img) this.updateSource({ img });
    }
  }

  /** @override */
  getRollData() {
    return this.actor ? this.actor.getRollData() : {};
  }

  /**
   * Mostra o item no chat.
   */
  async paraChat() {
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    const s = this.system;
    const enrich = html => TextEditor.enrichHTML(html ?? "", { relativeTo: this, secrets: this.isOwner });
    const ctx = {
      item: this,
      system: s,
      descricao: await enrich(s.descricao),
      ougi: s.ougi ? await enrich(s.ougi) : "",
      sincronizacao: s.sincronizacao ? await enrich(s.sincronizacao) : "",
      tipos: (s.tipos ?? []).map(t => game.i18n.localize(LENDA.estilo[t]?.label ?? t)).join(", "),
      elemento: s.elemento ? game.i18n.localize(LENDA.elementos[s.elemento] ?? "") : "",
      acao: s.acao ? game.i18n.localize(LENDA.acoes[s.acao] ?? "") : "",
      caracteristicas: (s.caracteristicas ?? []).map(c => game.i18n.localize(LENDA.caracteristicas[c]?.label ?? c)).join(", "),
      tipoNome: game.i18n.localize(`TYPES.Item.${this.type}`)
    };
    const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/chat/item.hbs`, ctx);
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content });
  }
}
