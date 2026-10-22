import { LENDA, SYSTEM_ID } from "../config.mjs";
import { abrirTeste, abrirAtaque, avaliarFormula, defesaTotal, usarTecnica } from "../dice/teste.mjs";
import { verificarRequisitos } from "../helpers/requisitos.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const TextEditor = () => foundry.applications.ux.TextEditor.implementation;
const loc = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/**
 * Ficha base para todos os tipos de ator.
 */
export class LendaActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["lenda", "sheet", "actor"],
    position: { width: 760, height: 820 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      tab: LendaActorSheet.#onTab,
      rolarAtributo: LendaActorSheet.#onRolarAtributo,
      rolarOcupacao: LendaActorSheet.#onRolarOcupacao,
      ataque: LendaActorSheet.#onAtaque,
      defesa: LendaActorSheet.#onDefesa,
      usarTecnica: LendaActorSheet.#onUsarTecnica,
      itemCriar: LendaActorSheet.#onItemCriar,
      itemEditar: LendaActorSheet.#onItemEditar,
      itemApagar: LendaActorSheet.#onItemApagar,
      itemAlternar: LendaActorSheet.#onItemAlternar,
      itemExpandir: LendaActorSheet.#onItemExpandir,
      itemChat: LendaActorSheet.#onItemChat,
      sinc: LendaActorSheet.#onSinc,
      ferimento: LendaActorSheet.#onFerimento,
      vigorCheio: LendaActorSheet.#onVigorCheio,
      zerarNagen: LendaActorSheet.#onZerarNagen,
      emocao: LendaActorSheet.#onEmocao,
      novaCena: LendaActorSheet.#onNovaCena,
      tensao: LendaActorSheet.#onTensao
    }
  };

  /** Abas da ficha: [{id, label, icon}] */
  static ABAS = [];

  tabGroups = { primary: null };

  /** IDs de itens com descrição expandida. */
  #expandidos = new Set();

  /** @override */
  get title() {
    return this.document.name;
  }

  /* -------------------------------------------- */
  /*  Contexto                                     */
  /* -------------------------------------------- */

  _abas() {
    const abas = this.constructor.ABAS;
    if (!abas.length) return [];
    const ativa = this.tabGroups.primary ??= abas[0].id;
    return abas.map(t => ({ ...t, label: loc(t.label), group: "primary", active: t.id === ativa, cssClass: t.id === ativa ? "active" : "" }));
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const s = actor.system;
    const abas = this._abas();
    Object.assign(context, {
      actor,
      system: s,
      source: actor.toObject().system,
      config: LENDA,
      editable: this.isEditable,
      owner: actor.isOwner,
      isGM: game.user.isGM,
      abas,
      aba: Object.fromEntries(abas.map(t => [t.id, t])),
      tensao: game.settings.get(SYSTEM_ID, "tensao")
    });

    if (s.atributos) {
      context.atributos = Object.entries(LENDA.atributos).map(([k, cfg]) => ({
        key: k, label: loc(cfg.label), abbr: cfg.abbr, value: s.atributos[k]
      }));
    }
    if (s.ocupacoes) {
      context.ocupacoes = Object.entries(LENDA.ocupacoes).map(([k, label]) => ({
        key: k, label: loc(label), value: s.ocupacoes[k].value, especializacoes: s.ocupacoes[k].especializacoes,
        nivel: loc(LENDA.niveisOcupacao[Math.min(3, s.ocupacoes[k].value)] ?? "")
      }));
    }
    if (s.estilo) {
      context.estilo = Object.entries(LENDA.estilo).map(([k, cfg]) => ({
        key: k, label: loc(cfg.label), value: s.estilo[k], ataque: cfg.ataque, icon: LENDA.icones[k]
      }));
      context.totalEstilo = Object.keys(LENDA.estilo).reduce((a, k) => a + s.estilo[k], 0);
    }
    if (s.ferimentos) {
      const max = s.ferimentos.max;
      const caixas = [];
      for (let i = 0; i < Math.max(max, s.ferimentos.value); i++) caixas.push({ indice: i, marcada: i < s.ferimentos.value, extra: i >= max });
      context.caixasFerimento = caixas;
    }
    if (s.vigor) context.vigorPct = s.vigor.max ? Math.clamp(Math.round(100 * s.vigor.value / s.vigor.max), 0, 100) : 0;
    if (s.nagen) context.nagenPct = s.limiares?.canalizacao?.value > 0 ? Math.clamp(Math.round(100 * s.nagen.rodada / s.limiares.canalizacao.value), 0, 100) : (s.nagen.rodada ? 100 : 0);

    await this._prepararItens(context);
    context.emocoes = Object.entries(LENDA.emocoes).map(([k, cfg]) => ({
      key: k, label: loc(cfg.label), hint: loc(cfg.hint), icon: cfg.icon,
      usada: k === "esperanca" ? (s.emocoes?.esperanca ?? 0) > 0 : !!s.emocoes?.[k]
    }));

    const enrich = html => TextEditor().enrichHTML(html ?? "", { secrets: actor.isOwner, relativeTo: actor, rollData: actor.getRollData() });
    context.enriched = {
      biografia: await enrich(s.biografia),
      notas: await enrich(s.notas),
      especial: await enrich(s.especial)
    };
    return context;
  }

  async _prepararItens(context) {
    const actor = this.document;
    const tecnicas = { ataques: [], defesas: [], outras: [] };
    const trunfos = [];
    const equipamentos = [];
    let caminho = null;
    const enrich = (html, item) => TextEditor().enrichHTML(html ?? "", { secrets: actor.isOwner, relativeTo: item, rollData: actor.getRollData() });
    const items = [...actor.items].sort((a, b) => (a.sort || 0) - (b.sort || 0));
    for (const item of items) {
      const s = item.system;
      const data = { id: item.id, uuid: item.uuid, name: item.name, img: item.img, type: item.type, system: s, expandido: this.#expandidos.has(item.id) };
      if (item.type === "tecnica") {
        data.icones = s.tipos.map(t => ({ src: LENDA.icones[t], label: loc(LENDA.estilo[t]?.label ?? t) }));
        if (s.elemento && LENDA.icones[s.elemento]) data.icones.push({ src: LENDA.icones[s.elemento], label: loc(LENDA.elementos[s.elemento]) });
        if (s.shintai) data.icones.push({ src: LENDA.icones.shintai, label: loc("LENDA.Tecnica.Shintai") });
        if (s.ritual) data.icones.push({ src: LENDA.icones.ritual, label: loc("LENDA.Tecnica.Ritual") });
        data.acao = loc(LENDA.acoes[s.acao] ?? "");
        data.custo = s.custoBase + (s.nagenNota ? "*" : "");
        data.upgrades = s.upgrades.map(u => loc(LENDA.upgrades[u]?.label ?? u)).join(", ");
        if (actor.type === "protagonista" || actor.type === "antagonista") {
          const req = verificarRequisitos(actor, s.requisitos, { ignorar: item.name });
          data.requisitosOk = req.ok;
          data.requisitosFaltando = req.faltando.join(", ");
        } else data.requisitosOk = true;
        if (data.expandido) {
          data.descricaoHtml = await enrich(s.descricao, item);
          data.ougiHtml = await enrich(s.ougi, item);
          data.sincHtml = await enrich(s.sincronizacao, item);
        }
        if (s.ataque.dano) data.dano = avaliarFormula(s.ataque.dano, actor.getRollData());
        if (s.tipoAtaque) tecnicas.ataques.push(data);
        else if (s.tipoDefesa) tecnicas.defesas.push(data);
        else tecnicas.outras.push(data);
      } else if (item.type === "trunfo") {
        if (data.expandido) data.descricaoHtml = await enrich(s.descricao, item);
        data.elementoNome = s.elemento ? loc(LENDA.elementos[s.elemento] ?? s.elemento) : "";
        trunfos.push(data);
      } else if (item.type === "equipamento") {
        data.categoriaNome = loc(LENDA.categoriasEquipamento[s.categoria] ?? "");
        data.caracteristicas = s.caracteristicas.map(c => ({ label: loc(LENDA.caracteristicas[c]?.label ?? c), hint: loc(LENDA.caracteristicas[c]?.hint ?? "") }));
        if (data.expandido) data.descricaoHtml = await enrich(s.descricao, item);
        equipamentos.push(data);
      } else if (item.type === "caminho") {
        caminho = data;
        data.descricaoHtml = await enrich(s.descricao, item);
      }
    }
    context.tecnicas = tecnicas;
    context.gruposTecnicas = [
      { chave: "ataques", titulo: "LENDA.Tecnica.Ataques", lista: tecnicas.ataques },
      { chave: "defesas", titulo: "LENDA.Tecnica.Defesas", lista: tecnicas.defesas },
      { chave: "outras", titulo: "LENDA.Tecnica.Outras", lista: tecnicas.outras }
    ];
    context.temTecnicas = tecnicas.ataques.length + tecnicas.defesas.length + tecnicas.outras.length > 0;
    context.numTecnicas = tecnicas.ataques.length + tecnicas.defesas.length + tecnicas.outras.length;
    context.trunfos = trunfos;
    context.equipamentos = equipamentos;
    context.caminho = caminho;
  }

  /* -------------------------------------------- */
  /*  Formulário                                   */
  /* -------------------------------------------- */

  /** @override */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    // Arrays editados por índice chegam como objetos: converte de volta.
    const lacos = foundry.utils.getProperty(data, "system.lacos");
    if (lacos && !Array.isArray(lacos)) {
      const atual = foundry.utils.deepClone(this.document.system.lacos ?? []);
      for (const [i, v] of Object.entries(lacos)) atual[Number(i)] = { ...(atual[Number(i)] ?? {}), ...v };
      foundry.utils.setProperty(data, "system.lacos", atual);
    }
    return data;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // Campos de itens embutidos editáveis diretamente na ficha.
    for (const input of this.element.querySelectorAll("[data-item-campo]")) {
      input.addEventListener("change", this.#onCampoItem.bind(this));
    }
    // Caminho: marcações de eventos.
    for (const input of this.element.querySelectorAll("[data-evento]")) {
      input.addEventListener("change", this.#onEvento.bind(this));
    }
  }

  async #onCampoItem(event) {
    event.stopPropagation();
    const el = event.currentTarget;
    const item = this.document.items.get(el.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    let valor = el.type === "checkbox" ? el.checked : el.value;
    if (el.dataset.dtype === "Number") valor = Number(valor) || 0;
    await item.update({ [el.dataset.itemCampo]: valor });
  }

  async #onEvento(event) {
    event.stopPropagation();
    const el = event.currentTarget;
    const item = this.document.caminho;
    if (!item) return;
    if (el.dataset.evento === "reviravolta") return item.update({ "system.reviravolta.marcado": el.checked });
    const eventos = foundry.utils.deepClone(item.system.eventos);
    const i = Number(el.dataset.evento);
    if (eventos[i]) eventos[i].marcado = el.checked;
    return item.update({ "system.eventos": eventos });
  }

  /* -------------------------------------------- */
  /*  Arrastar e soltar                            */
  /* -------------------------------------------- */

  /** @override */
  async _onDropItem(event, item) {
    if (!this.document.isOwner) return null;
    if (item.parent?.uuid === this.document.uuid) return super._onDropItem(event, item);
    switch (item.type) {
      case "estilo": return this.#aplicarEstilo(item);
      case "upgrade": return this.#aplicarUpgrade(item);
      case "caminho": {
        if (this.document.type !== "protagonista") {
          ui.notifications.warn(loc("LENDA.Aviso.CaminhoSoProtagonista"));
          return null;
        }
        const atual = this.document.caminho;
        if (atual) await atual.delete();
        break;
      }
      case "tecnica": {
        const req = verificarRequisitos(this.document, item.system.requisitos, { ignorar: item.name });
        if (!req.ok && ["protagonista", "antagonista"].includes(this.document.type)) {
          ui.notifications.warn(loc("LENDA.Aviso.RequisitosFaltando", { nome: item.name, faltando: req.faltando.join(", ") }));
        }
        const af = this.document.system.modificadores?.afinidades ?? [];
        const el = item.system.elemento;
        if (["agua", "ar", "fogo", "terra"].includes(el)) {
          const aceito = af.find(a => a.tipo === "aceito");
          if (aceito && aceito.elemento !== el && !this.document.system.modificadores?.jasq) {
            ui.notifications.warn(loc("LENDA.Aviso.AceitoOutroElemento"));
          }
          if (af.some(a => LENDA.elementoOposto[a.elemento] === el)) ui.notifications.warn(loc("LENDA.Aviso.ElementoOposto"));
        }
        break;
      }
    }
    return super._onDropItem(event, item);
  }

  async #aplicarEstilo(item) {
    const v = item.system.valores;
    const updates = { "system.estilo.nome": item.name };
    for (const k of Object.keys(LENDA.estilo)) updates[`system.estilo.${k}`] = v[k];
    await this.document.update(updates);
    ui.notifications.info(loc("LENDA.Aviso.EstiloAplicado", { nome: item.name }));
    return null;
  }

  async #aplicarUpgrade(item) {
    const tecnicas = this.document.tecnicas;
    if (!tecnicas.length) {
      ui.notifications.warn(loc("LENDA.Aviso.SemTecnicas"));
      return null;
    }
    const opcoes = tecnicas.map(t => `<option value="${t.id}">${t.name}</option>`).join("");
    const id = await foundry.applications.api.DialogV2.prompt({
      window: { title: loc("LENDA.Upgrade.Aplicar", { nome: item.name }) },
      content: `<div class="form-group"><label>${loc("LENDA.Tecnica.Nome")}</label><select name="tecnica">${opcoes}</select></div>`,
      ok: { label: loc("LENDA.Upgrade.Confirmar"), callback: (event, button) => button.form.elements.tecnica.value },
      rejectClose: false
    });
    const tec = id ? this.document.items.get(id) : null;
    if (!tec) return null;
    const ups = new Set(tec.system.upgrades);
    ups.add(item.system.chave);
    await tec.update({ "system.upgrades": [...ups] });
    ui.notifications.info(loc("LENDA.Aviso.UpgradeAplicado", { upgrade: item.name, tecnica: tec.name }));
    return null;
  }

  /* -------------------------------------------- */
  /*  Ações                                        */
  /* -------------------------------------------- */

  static #onTab(event, target) {
    const tab = target.dataset.tab;
    this.tabGroups.primary = tab;
    for (const el of this.element.querySelectorAll("[data-group='primary']")) {
      el.classList.toggle("active", el.dataset.tab === tab);
    }
  }

  static #onRolarAtributo(event, target) {
    return abrirTeste(this.document, { atributo: target.dataset.atributo });
  }

  static #onRolarOcupacao(event, target) {
    const k = target.dataset.ocupacao;
    return abrirTeste(this.document, { atributo: target.dataset.atributo ?? "razao", bonus: `ocupacao.${k}`, titulo: loc(LENDA.ocupacoes[k]) });
  }

  static #onAtaque(event, target) {
    return abrirAtaque(this.document, { tipo: target.dataset.tipo });
  }

  static #onDefesa(event, target) {
    return defesaTotal(this.document, target.dataset.tipo);
  }

  static #onUsarTecnica(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (item) return usarTecnica(this.document, item);
  }

  static async #onItemCriar(event, target) {
    const type = target.dataset.type;
    const nome = loc("LENDA.Item.Novo", { tipo: loc(`TYPES.Item.${type}`) });
    const system = {};
    if (target.dataset.categoria) system.categoria = target.dataset.categoria;
    const [item] = await this.document.createEmbeddedDocuments("Item", [{ name: nome, type, system, img: LENDA.defaultIcons[type] }]);
    item?.sheet.render(true);
  }

  static #onItemEditar(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    item?.sheet.render(true);
  }

  static async #onItemApagar(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (!item) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: loc("LENDA.Item.ApagarTitulo") },
      content: `<p>${loc("LENDA.Item.ApagarConfirmar", { nome: item.name })}</p>`
    });
    if (ok) return item.delete();
  }

  static #onItemAlternar(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    const campo = target.dataset.campo;
    if (!item || !campo) return;
    return item.update({ [campo]: !foundry.utils.getProperty(item, campo) });
  }

  static #onItemExpandir(event, target) {
    const id = target.closest("[data-item-id]").dataset.itemId;
    if (this.#expandidos.has(id)) this.#expandidos.delete(id);
    else this.#expandidos.add(id);
    this.render();
  }

  static #onItemChat(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    return item?.paraChat();
  }

  static #onSinc(event, target) {
    const delta = Number(target.dataset.delta) || 0;
    return this.document.ajustarSincronizacao(delta);
  }

  static #onFerimento(event, target) {
    const i = Number(target.dataset.indice);
    const atual = this.document.system.ferimentos.value;
    const novo = i < atual ? i : i + 1;
    return this.document.update({ "system.ferimentos.value": novo });
  }

  static #onVigorCheio() {
    const s = this.document.system;
    if (this.document.type === "espirito") return this.document.update({ "system.reserva.value": s.reserva.max });
    return this.document.update({ "system.vigor.value": s.vigor.max });
  }

  static #onZerarNagen() {
    return this.document.update({ "system.nagen.rodada": 0 });
  }

  static #onEmocao(event, target) {
    return this.document.invocarEmocao(target.dataset.emocao);
  }

  static async #onNovaCena() {
    await this.document.novaCena();
    ui.notifications.info(loc("LENDA.Cena.AtorPreparado", { nome: this.document.name }));
  }

  static #onTensao(event, target) {
    return this.document.comprarComTensao(target.dataset.tipo);
  }
}

/* -------------------------------------------- */
/*  Protagonista                                 */
/* -------------------------------------------- */

export class ProtagonistaSheet extends LendaActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["protagonista"],
    actions: {
      lacoAdicionar: ProtagonistaSheet.#onLacoAdicionar,
      lacoRemover: ProtagonistaSheet.#onLacoRemover,
      lacoInvocar: ProtagonistaSheet.#onLacoInvocar,
      encerrarSessao: ProtagonistaSheet.#onEncerrarSessao,
      comprarAvanco: ProtagonistaSheet.#onComprarAvanco,
      assistente: ProtagonistaSheet.#onAssistente,
      abrirGuia: ProtagonistaSheet.#onAbrirGuia
    }
  };

  static PARTS = {
    sheet: { template: `systems/${SYSTEM_ID}/templates/actor/protagonista.hbs`, scrollable: [".aba-corpo"] }
  };

  static ABAS = [
    { id: "ficha", label: "LENDA.Aba.Ficha", icon: "fas fa-user" },
    { id: "tecnicas", label: "LENDA.Aba.Tecnicas", icon: "fas fa-fire" },
    { id: "combate", label: "LENDA.Aba.Combate", icon: "fas fa-hand-fist" },
    { id: "caminho", label: "LENDA.Aba.Caminho", icon: "fas fa-route" },
    { id: "biografia", label: "LENDA.Aba.Biografia", icon: "fas fa-book" }
  ];

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const s = this.document.system;
    context.lacos = s.lacos.map((l, i) => ({ ...l, indice: i }));
    context.avancosTabela = LENDA.avancos.map(a => ({ label: loc(a.label), custo: a.custo }));
    context.avancosDisponiveis = Math.floor(s.karma.value / 5);
    context.caminhoMarcados = context.caminho ? context.caminho.system.eventos.filter(e => e.marcado).length : 0;
    context.karmaPrevisto = context.caminhoMarcados + s.lacos.filter(l => l.marcado).length + 1 + (context.caminho?.system.reviravolta.marcado ? 2 : 0);
    return context;
  }

  static #onLacoAdicionar() {
    const lacos = foundry.utils.deepClone(this.document.system.lacos);
    lacos.push({ nome: "", marcado: false });
    return this.document.update({ "system.lacos": lacos });
  }

  static #onLacoRemover(event, target) {
    const lacos = foundry.utils.deepClone(this.document.system.lacos);
    lacos.splice(Number(target.dataset.indice), 1);
    return this.document.update({ "system.lacos": lacos });
  }

  static #onLacoInvocar(event, target) {
    return this.document.invocarLaco(Number(target.dataset.indice));
  }

  static async #onEncerrarSessao() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: loc("LENDA.Sessao.Encerrar") },
      content: `<p>${loc("LENDA.Sessao.EncerrarConfirmar")}</p>`
    });
    if (ok) return this.document.encerrarSessao();
  }

  static async #onComprarAvanco() {
    return this.document.comprarAvancos(1);
  }

  static async #onAssistente() {
    const { AssistenteCriacao } = await import("../apps/assistente.mjs");
    return new AssistenteCriacao({ document: this.document }).render(true);
  }

  static async #onAbrirGuia() {
    const pack = game.packs.get(`${SYSTEM_ID}.regras`);
    const idx = await pack?.getIndex();
    const entry = idx?.find(e => e.name.startsWith("Passo a Passo"));
    if (!entry) return;
    const doc = await pack.getDocument(entry._id);
    return doc?.sheet.render(true);
  }
}

/* -------------------------------------------- */
/*  Antagonista                                  */
/* -------------------------------------------- */

export class AntagonistaSheet extends LendaActorSheet {
  static DEFAULT_OPTIONS = { classes: ["antagonista"] };

  static PARTS = {
    sheet: { template: `systems/${SYSTEM_ID}/templates/actor/antagonista.hbs`, scrollable: [".aba-corpo"] }
  };

  static ABAS = [
    { id: "ficha", label: "LENDA.Aba.Ficha", icon: "fas fa-user" },
    { id: "tecnicas", label: "LENDA.Aba.Tecnicas", icon: "fas fa-fire" },
    { id: "combate", label: "LENDA.Aba.Combate", icon: "fas fa-hand-fist" },
    { id: "biografia", label: "LENDA.Aba.Biografia", icon: "fas fa-book" }
  ];
}

/* -------------------------------------------- */
/*  Coadjuvante                                  */
/* -------------------------------------------- */

export class CoadjuvanteSheet extends LendaActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["coadjuvante"],
    position: { width: 640, height: 760 }
  };

  static PARTS = {
    sheet: { template: `systems/${SYSTEM_ID}/templates/actor/coadjuvante.hbs`, scrollable: [".aba-corpo"] }
  };

  static ABAS = [
    { id: "ficha", label: "LENDA.Aba.Ficha", icon: "fas fa-user" },
    { id: "biografia", label: "LENDA.Aba.Biografia", icon: "fas fa-book" }
  ];
}

/* -------------------------------------------- */
/*  Espírito                                     */
/* -------------------------------------------- */

export class EspiritoSheet extends LendaActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["espirito"],
    position: { width: 600, height: 640 },
    actions: { rolarEspirito: EspiritoSheet.#onRolar }
  };

  static PARTS = {
    sheet: { template: `systems/${SYSTEM_ID}/templates/actor/espirito.hbs`, scrollable: [".aba-corpo"] }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.reservaPct = context.system.reserva.max ? Math.clamp(Math.round(100 * context.system.reserva.value / context.system.reserva.max), 0, 100) : 0;
    return context;
  }

  static #onRolar() {
    return abrirTeste(this.document, { titulo: loc("LENDA.Espirito.Teste") });
  }
}
