import { LENDA, SYSTEM_ID } from "../config.mjs";
import { verificarRequisitos, normalizar } from "../helpers/requisitos.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const loc = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

const PASSOS = ["conceito", "aura", "caminho", "lacos", "atributos", "ocupacoes", "estilo", "trunfos", "tecnicas", "resumo"];
const ELEMENTAIS = ["agua", "ar", "fogo", "terra"];

/**
 * Assistente de criação de protagonista, seguindo o passo a passo do capítulo 4.
 */
export class AssistenteCriacao extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.actor = options.document;
    this.estado = this.#estadoInicial();
    this.indices = null;
  }

  static DEFAULT_OPTIONS = {
    id: "lenda-assistente-{id}",
    tag: "form",
    classes: ["lenda", "lenda-assistente"],
    position: { width: 880, height: 760 },
    window: { title: "LENDA.Assistente.Titulo", icon: "fas fa-hat-wizard", resizable: true },
    form: { handler: AssistenteCriacao.#onSubmit, submitOnChange: true, closeOnSubmit: false },
    actions: {
      passo: AssistenteCriacao.#onPasso,
      anterior: AssistenteCriacao.#onAnterior,
      proximo: AssistenteCriacao.#onProximo,
      aplicar: AssistenteCriacao.#onAplicar,
      ajustar: AssistenteCriacao.#onAjustar,
      estiloPreset: AssistenteCriacao.#onEstiloPreset,
      lacoAdicionar: AssistenteCriacao.#onLacoAdicionar,
      lacoRemover: AssistenteCriacao.#onLacoRemover,
      verItem: AssistenteCriacao.#onVerItem
    }
  };

  static PARTS = {
    main: { template: `systems/${SYSTEM_ID}/templates/apps/assistente.hbs`, scrollable: [".assistente-conteudo"] }
  };

  get title() {
    return `${loc("LENDA.Assistente.Titulo")}: ${this.actor.name}`;
  }

  #estadoInicial() {
    const s = this.actor.system;
    const atributos = {};
    for (const k of Object.keys(LENDA.atributos)) atributos[k] = Math.clamp(s.atributos?.[k] ?? 1, 1, 5);
    const ocupacoes = {};
    const especializacoes = {};
    for (const k of Object.keys(LENDA.ocupacoes)) {
      ocupacoes[k] = s.ocupacoes?.[k]?.value ?? 0;
      especializacoes[k] = s.ocupacoes?.[k]?.especializacoes ?? "";
    }
    const estilo = {};
    for (const k of Object.keys(LENDA.estilo)) estilo[k] = s.estilo?.[k] ?? 0;
    const lacos = (s.lacos ?? []).map(l => l.nome);
    while (lacos.length < 3) lacos.push("");
    return {
      passo: 0,
      nome: this.actor.name,
      conceito: s.conceito ?? "",
      caminho: null,
      lacos,
      atributos,
      ocupacoes,
      especializacoes,
      estilo,
      estiloNome: s.estilo?.nome ?? "",
      trunfos: [],
      elementos: {},
      prodigio: "",
      tecnicas: [],
      ougis: [],
      filtro: "",
      categoria: "todas",
      substituir: true
    };
  }

  /* -------------------------------------------- */
  /*  Dados de compêndio                           */
  /* -------------------------------------------- */

  async #carregarIndices() {
    if (this.indices) return this.indices;
    const carregar = async (nome, fields) => {
      const pack = game.packs.get(`${SYSTEM_ID}.${nome}`);
      if (!pack) return [];
      const idx = await pack.getIndex({ fields });
      return [...idx].map(e => ({ ...e, uuid: e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}` })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    };
    this.indices = {
      caminhos: await carregar("caminhos", ["system.eventos", "system.reviravolta"]),
      trunfos: await carregar("trunfos", ["system.requisitos", "system.criacao", "system.afinidade", "system.elemento", "system.jasq", "system.prodigio"]),
      estilos: await carregar("estilos", ["system.valores", "system.ougis", "system.secreto"]),
      tecnicas: await carregar("tecnicas", ["system.requisitos", "system.elemento", "system.tipos", "system.shintai", "system.ritual", "system.nagen", "system.acao"])
    };
    return this.indices;
  }

  /** Limites de criação considerando os trunfos escolhidos. */
  #limites() {
    const L = { ...LENDA.criacao, especializacoesGratis: 0, shintai: 0, rituais: 0, equipamentos: 1 };
    let estiloMax = null;
    const trunfos = this.#trunfosEscolhidos();
    for (const t of trunfos) {
      const c = t.system?.criacao ?? {};
      L.lacos += c.lacos ?? 0;
      L.tecnicas += c.tecnicas ?? 0;
      L.estilo += c.estilo ?? 0;
      L.ocupacoes += c.ocupacoes ?? 0;
      L.especializacoesGratis += c.especializacoes ?? 0;
      L.ougis += c.ougis ?? 0;
      L.shintai += c.shintai ?? 0;
      L.rituais = Math.max(L.rituais, c.rituais ?? 0);
      L.equipamentos += c.equipamentos ?? 0;
      if (c.estiloMax) estiloMax = Math.min(estiloMax ?? 99, c.estiloMax);
    }
    L.estiloMax = estiloMax ?? LENDA.criacao.estiloMax;
    L.ougis = Math.max(0, L.ougis);
    L.medium = trunfos.some(t => /m[eé]dium/i.test(t.name));
    L.ritualista = trunfos.some(t => /ritualista/i.test(t.name));
    L.hanyo = trunfos.some(t => /hanyo/i.test(t.name));
    L.jasq = trunfos.some(t => t.system?.jasq);
    L.prodigio = trunfos.some(t => t.system?.prodigio);
    const afin = trunfos.filter(t => t.system?.afinidade).map(t => ({ tipo: t.system.afinidade, elemento: this.estado.elementos[t._id] || t.system.elemento || "" }));
    L.afinidades = afin;
    return L;
  }

  #trunfosEscolhidos() {
    return (this.indices?.trunfos ?? []).filter(t => this.estado.trunfos.includes(t._id));
  }

  #tecnicasEscolhidas() {
    return (this.indices?.tecnicas ?? []).filter(t => this.estado.tecnicas.includes(t._id));
  }

  #contarEspecializacoes() {
    let n = 0;
    for (const v of Object.values(this.estado.especializacoes)) n += String(v).split(",").map(x => x.trim()).filter(Boolean).length;
    return n;
  }

  /** Dados para verificação de requisitos. */
  #fonteRequisitos() {
    const e = this.estado;
    const atributos = { ...e.atributos };
    if (e.prodigio && atributos[e.prodigio] === 5) atributos[e.prodigio] = 6;
    const itens = [...this.#trunfosEscolhidos().map(t => t.name), ...this.#tecnicasEscolhidas().map(t => t.name)];
    return { atributos, aura: LENDA.criacao.aura, ocupacoes: e.ocupacoes, especializacoes: Object.values(e.especializacoes).join(" "), itens };
  }

  /** Validações de cada passo. Retorna {passo: [mensagens]} */
  #validar() {
    const e = this.estado;
    const L = this.#limites();
    const v = Object.fromEntries(PASSOS.map(p => [p, []]));
    if (!e.conceito.trim()) v.conceito.push(loc("LENDA.Assistente.Erro.Conceito"));
    if (!e.caminho) v.caminho.push(loc("LENDA.Assistente.Erro.Caminho"));
    const lacos = e.lacos.filter(l => l.trim()).length;
    if (lacos !== L.lacos) v.lacos.push(loc("LENDA.Assistente.Erro.Lacos", { n: lacos, max: L.lacos }));
    const somaAtr = Object.values(e.atributos).reduce((a, b) => a + b, 0);
    if (somaAtr !== LENDA.criacao.atributos) v.atributos.push(loc("LENDA.Assistente.Erro.Atributos", { n: somaAtr, max: LENDA.criacao.atributos }));
    const somaOc = Object.values(e.ocupacoes).reduce((a, b) => a + b, 0);
    const espPagas = Math.max(0, this.#contarEspecializacoes() - L.especializacoesGratis);
    if (somaOc + espPagas !== L.ocupacoes) v.ocupacoes.push(loc("LENDA.Assistente.Erro.Ocupacoes", { n: somaOc + espPagas, max: L.ocupacoes }));
    for (const [k, txt] of Object.entries(e.especializacoes)) {
      const n = String(txt).split(",").map(x => x.trim()).filter(Boolean).length;
      const permitido = e.ocupacoes[k] >= 3 ? 2 : e.ocupacoes[k] >= 2 ? 1 : 0;
      if (n > permitido) v.ocupacoes.push(loc("LENDA.Assistente.Erro.Especializacao", { ocupacao: loc(LENDA.ocupacoes[k]) }));
    }
    const somaEst = Object.values(e.estilo).reduce((a, b) => a + b, 0);
    if (somaEst !== L.estilo) v.estilo.push(loc("LENDA.Assistente.Erro.Estilo", { n: somaEst, max: L.estilo }));
    if (Object.values(e.estilo).some(x => x > L.estiloMax)) v.estilo.push(loc("LENDA.Assistente.Erro.EstiloMax", { max: L.estiloMax }));
    if (e.trunfos.length !== LENDA.criacao.trunfos) v.trunfos.push(loc("LENDA.Assistente.Erro.Trunfos", { n: e.trunfos.length, max: LENDA.criacao.trunfos }));
    for (const t of this.#trunfosEscolhidos()) {
      if (t.system?.afinidade && !(this.estado.elementos[t._id] || t.system.elemento)) v.trunfos.push(loc("LENDA.Assistente.Erro.Elemento", { nome: t.name }));
      const req = verificarRequisitos(this.#fonteRequisitos(), t.system?.requisitos ?? "", { ignorar: t.name });
      if (!req.ok) v.trunfos.push(loc("LENDA.Assistente.Erro.RequisitoTrunfo", { nome: t.name, faltando: req.faltando.join(", ") }));
    }
    if (L.prodigio && !(e.prodigio && e.atributos[e.prodigio] === 5)) v.trunfos.push(loc("LENDA.Assistente.Erro.Prodigio"));
    // Técnicas
    const tecs = this.#tecnicasEscolhidas();
    const shintai = tecs.filter(t => t.system?.shintai);
    const rituais = tecs.filter(t => t.system?.ritual);
    const invocacaoGratis = L.medium && tecs.some(t => /ritual de invoca/i.test(t.name)) ? 1 : 0;
    const extrasShintai = Math.min(shintai.length, L.shintai);
    const contam = tecs.length - extrasShintai - invocacaoGratis;
    if (contam !== L.tecnicas) v.tecnicas.push(loc("LENDA.Assistente.Erro.Tecnicas", { n: contam, max: L.tecnicas }));
    if (shintai.length && !L.hanyo) v.tecnicas.push(loc("LENDA.Assistente.Erro.Shintai"));
    if (L.hanyo && shintai.length > 1) v.tecnicas.push(loc("LENDA.Assistente.Erro.ShintaiUm"));
    if (L.ritualista && rituais.length < 3) v.tecnicas.push(loc("LENDA.Assistente.Erro.Ritualista"));
    for (const t of tecs) {
      const req = verificarRequisitos(this.#fonteRequisitos(), t.system?.requisitos ?? "", { ignorar: t.name });
      if (!req.ok) v.tecnicas.push(loc("LENDA.Assistente.Erro.RequisitoTecnica", { nome: t.name, faltando: req.faltando.join(", ") }));
      const bloqueio = this.#bloqueioElemental(t, L);
      if (bloqueio) v.tecnicas.push(`${t.name}: ${bloqueio}`);
    }
    const ougis = e.ougis.filter(id => e.tecnicas.includes(id)).length;
    if (ougis !== L.ougis) v.tecnicas.push(loc("LENDA.Assistente.Erro.Ougi", { n: ougis, max: L.ougis }));
    return v;
  }

  /** Restrições de afinidade (Aceito/Tocado). */
  #bloqueioElemental(t, L) {
    const el = t.system?.elemento;
    if (!ELEMENTAIS.includes(el)) return null;
    for (const a of L.afinidades) {
      if (!a.elemento) continue;
      if (a.tipo === "aceito" && a.elemento !== el && !L.jasq) return loc("LENDA.Aviso.AceitoOutroElemento");
      if (LENDA.elementoOposto[a.elemento] === el) return loc("LENDA.Aviso.ElementoOposto");
    }
    return null;
  }

  /* -------------------------------------------- */
  /*  Contexto                                     */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const idx = await this.#carregarIndices();
    const e = this.estado;
    const L = this.#limites();
    const validacao = this.#validar();
    const passoAtual = PASSOS[e.passo];
    const fonte = this.#fonteRequisitos();

    const somaAtr = Object.values(e.atributos).reduce((a, b) => a + b, 0);
    const somaOc = Object.values(e.ocupacoes).reduce((a, b) => a + b, 0);
    const espPagas = Math.max(0, this.#contarEspecializacoes() - L.especializacoesGratis);
    const somaEst = Object.values(e.estilo).reduce((a, b) => a + b, 0);

    Object.assign(ctx, {
      actor: this.actor,
      estado: e,
      limites: L,
      passos: PASSOS.map((p, i) => ({ id: p, indice: i, numero: i + 1, label: loc(`LENDA.Assistente.Passo.${p}`), ativo: i === e.passo, ok: !validacao[p].length })),
      passo: passoAtual,
      ["passo_" + passoAtual]: true,
      erros: validacao[passoAtual],
      todosErros: PASSOS.flatMap(p => validacao[p]),
      primeiro: e.passo === 0,
      ultimo: e.passo === PASSOS.length - 1,
      restAtr: LENDA.criacao.atributos - somaAtr,
      restOc: L.ocupacoes - somaOc - espPagas,
      restEst: L.estilo - somaEst
    });

    ctx.caminhos = idx.caminhos.map(c => ({ ...c, selecionado: c._id === e.caminho }));
    ctx.atributos = Object.entries(LENDA.atributos).map(([k, cfg]) => ({
      key: k, label: loc(cfg.label), abbr: cfg.abbr, value: e.atributos[k],
      final: L.prodigio && e.prodigio === k && e.atributos[k] === 5 ? 6 : e.atributos[k],
      descricao: loc(`LENDA.Atributo.${k}Hint`)
    }));
    ctx.ocupacoes = Object.entries(LENDA.ocupacoes).map(([k, label]) => ({
      key: k, label: loc(label), value: e.ocupacoes[k], especializacoes: e.especializacoes[k],
      podeEspecializar: e.ocupacoes[k] >= 2, descricao: loc(`LENDA.Ocupacao.${k}Hint`)
    }));
    ctx.estilo = Object.entries(LENDA.estilo).map(([k, cfg]) => ({ key: k, label: loc(cfg.label), value: e.estilo[k], icon: LENDA.icones[k] }));
    ctx.estilos = idx.estilos.map(s => ({ ...s, resumo: Object.entries(s.system?.valores ?? {}).map(([k, v]) => `${loc(LENDA.estilo[k]?.label ?? k)} ${v}`).join(", "), ougis: (s.system?.ougis ?? []).join(", ") }));
    ctx.trunfos = idx.trunfos.map(t => {
      const req = verificarRequisitos(fonte, t.system?.requisitos ?? "", { ignorar: t.name });
      return { ...t, selecionado: e.trunfos.includes(t._id), reqOk: req.ok, faltando: req.faltando.join(", "),
        precisaElemento: !!t.system?.afinidade && !t.system?.elemento, elemento: e.elementos[t._id] ?? "" };
    });
    ctx.elementos = ELEMENTAIS.map(k => ({ value: k, label: loc(LENDA.elementos[k]) }));
    ctx.temProdigio = L.prodigio;
    ctx.opcoesProdigio = Object.entries(LENDA.atributos).filter(([k]) => e.atributos[k] === 5).map(([k, cfg]) => ({ value: k, label: loc(cfg.label), selecionado: e.prodigio === k }));

    // Técnicas com filtros.
    const filtro = normalizar(e.filtro);
    ctx.categorias = [
      { value: "todas", label: loc("LENDA.Assistente.Categoria.todas") },
      { value: "selecionadas", label: loc("LENDA.Assistente.Categoria.selecionadas") },
      { value: "disponiveis", label: loc("LENDA.Assistente.Categoria.disponiveis") },
      { value: "ataques", label: loc("LENDA.Tecnica.Ataques") },
      { value: "defesas", label: loc("LENDA.Tecnica.Defesas") },
      { value: "agua", label: loc("LENDA.Elemento.agua") },
      { value: "ar", label: loc("LENDA.Elemento.ar") },
      { value: "fogo", label: loc("LENDA.Elemento.fogo") },
      { value: "terra", label: loc("LENDA.Elemento.terra") },
      { value: "shintai", label: loc("LENDA.Tecnica.Shintai") },
      { value: "rituais", label: loc("LENDA.Tecnica.Rituais") }
    ].map(c => ({ ...c, selecionado: c.value === e.categoria }));
    ctx.tecnicas = idx.tecnicas.map(t => {
      const s = t.system ?? {};
      const req = verificarRequisitos(fonte, s.requisitos ?? "", { ignorar: t.name });
      const bloqueio = this.#bloqueioElemental(t, L) || (s.shintai && !L.hanyo ? loc("LENDA.Assistente.Erro.Shintai") : null);
      const icones = (s.tipos ?? []).map(k => ({ src: LENDA.icones[k], label: loc(LENDA.estilo[k]?.label ?? k) }));
      if (s.elemento && LENDA.icones[s.elemento]) icones.push({ src: LENDA.icones[s.elemento], label: loc(LENDA.elementos[s.elemento]) });
      return { ...t, s, icones, reqOk: req.ok, faltando: req.faltando.join(", "), bloqueio,
        selecionado: e.tecnicas.includes(t._id), ougi: e.ougis.includes(t._id), acao: loc(LENDA.acoes[s.acao] ?? "") };
    }).filter(t => {
      if (filtro && !normalizar(t.name).includes(filtro)) return false;
      const s = t.s;
      switch (e.categoria) {
        case "selecionadas": return t.selecionado;
        case "disponiveis": return t.reqOk && !t.bloqueio;
        case "ataques": return (s.tipos ?? []).some(x => LENDA.tiposAtaque[x]);
        case "defesas": return (s.tipos ?? []).some(x => x === "bloqueio" || x === "evasao");
        case "agua": case "ar": case "fogo": case "terra": return s.elemento === e.categoria;
        case "shintai": return s.shintai;
        case "rituais": return s.ritual;
        default: return true;
      }
    });
    const tecs = this.#tecnicasEscolhidas();
    ctx.numTecnicas = tecs.length;
    ctx.selecionadasNomes = tecs.map(t => ({ ...t, ougi: e.ougis.includes(t._id) }));

    // Resumo / derivados.
    const atr = fonte.atributos;
    const aura = LENDA.criacao.aura;
    const mods = { vigor: 0, protecao: 0, canalizacao: 0, ferimentos: 0, sincInicial: 0, defesa: 0 };
    // Os modificadores dos trunfos estão nos documentos; carregamos sob demanda no resumo.
    if (passoAtual === "resumo") {
      for (const t of this.#trunfosEscolhidos()) {
        const doc = await fromUuid(t.uuid);
        const m = doc?.system?.modificadores ?? {};
        for (const k of Object.keys(mods)) mods[k] += m[k] ?? 0;
      }
    }
    ctx.derivados = {
      vigor: aura + atr.vontade + atr.forca + mods.vigor,
      canalizacao: aura + 2 + mods.canalizacao,
      defesa: aura + atr.agilidade + Math.max(atr.razao, atr.instinto) + e.estilo.evasao + mods.defesa,
      protecao: aura + atr.forca + e.estilo.bloqueio + mods.protecao,
      ferimentos: 1 + mods.ferimentos,
      sinc: Math.max(0, aura + mods.sincInicial)
    };
    ctx.caminhoNome = idx.caminhos.find(c => c._id === e.caminho)?.name ?? "—";
    ctx.trunfosNomes = this.#trunfosEscolhidos().map(t => t.name + (e.elementos[t._id] ? ` (${loc(LENDA.elementos[e.elementos[t._id]])})` : "")).join(", ") || "—";
    return ctx;
  }

  /* -------------------------------------------- */
  /*  Formulário                                   */
  /* -------------------------------------------- */

  static async #onSubmit(event, form, formData) {
    const d = foundry.utils.expandObject(formData.object);
    const e = this.estado;
    if ("nome" in d) e.nome = d.nome;
    if ("conceito" in d) e.conceito = d.conceito;
    if ("caminho" in d) e.caminho = d.caminho || null;
    if (d.lacos) for (const [i, v] of Object.entries(d.lacos)) e.lacos[Number(i)] = v;
    if (d.atributos) for (const [k, v] of Object.entries(d.atributos)) e.atributos[k] = Math.clamp(Number(v) || 1, 1, 5);
    if (d.ocupacoes) for (const [k, v] of Object.entries(d.ocupacoes)) e.ocupacoes[k] = Math.clamp(Number(v) || 0, 0, LENDA.criacao.ocupacaoMax);
    if (d.especializacoes) for (const [k, v] of Object.entries(d.especializacoes)) e.especializacoes[k] = v ?? "";
    if (d.estilo) for (const [k, v] of Object.entries(d.estilo)) e.estilo[k] = Math.clamp(Number(v) || 0, 0, 6);
    if ("estiloNome" in d) e.estiloNome = d.estiloNome;
    if (d.trunfos) {
      for (const [id, marcado] of Object.entries(d.trunfos)) {
        const tem = e.trunfos.includes(id);
        if (marcado && !tem) e.trunfos.push(id);
        if (!marcado && tem) e.trunfos = e.trunfos.filter(x => x !== id);
      }
    }
    if (d.elementos) Object.assign(e.elementos, d.elementos);
    if ("prodigio" in d) e.prodigio = d.prodigio;
    if (d.tecnicas) {
      for (const [id, marcado] of Object.entries(d.tecnicas)) {
        const tem = e.tecnicas.includes(id);
        if (marcado && !tem) e.tecnicas.push(id);
        if (!marcado && tem) e.tecnicas = e.tecnicas.filter(x => x !== id);
      }
    }
    if (d.ougis) {
      for (const [id, marcado] of Object.entries(d.ougis)) {
        const tem = e.ougis.includes(id);
        if (marcado && !tem) e.ougis.push(id);
        if (!marcado && tem) e.ougis = e.ougis.filter(x => x !== id);
      }
    }
    if ("filtro" in d) e.filtro = d.filtro ?? "";
    if ("categoria" in d) e.categoria = d.categoria;
    if ("substituir" in d) e.substituir = !!d.substituir;
    this.render();
  }

  static #onPasso(event, target) {
    this.estado.passo = Number(target.dataset.indice);
    this.render();
  }

  static #onAnterior() {
    this.estado.passo = Math.max(0, this.estado.passo - 1);
    this.render();
  }

  static #onProximo() {
    this.estado.passo = Math.min(PASSOS.length - 1, this.estado.passo + 1);
    this.render();
  }

  static #onAjustar(event, target) {
    const { grupo, chave, delta } = target.dataset;
    const e = this.estado;
    const d = Number(delta);
    if (grupo === "atributos") e.atributos[chave] = Math.clamp(e.atributos[chave] + d, 1, 5);
    else if (grupo === "ocupacoes") e.ocupacoes[chave] = Math.clamp(e.ocupacoes[chave] + d, 0, LENDA.criacao.ocupacaoMax);
    else if (grupo === "estilo") e.estilo[chave] = Math.clamp(e.estilo[chave] + d, 0, 6);
    this.render();
  }

  static #onEstiloPreset(event, target) {
    const est = this.indices.estilos.find(s => s._id === target.dataset.id);
    if (!est) return;
    for (const k of Object.keys(LENDA.estilo)) this.estado.estilo[k] = est.system?.valores?.[k] ?? 0;
    this.estado.estiloNome = est.name;
    this.render();
  }

  static #onLacoAdicionar() {
    this.estado.lacos.push("");
    this.render();
  }

  static #onLacoRemover(event, target) {
    this.estado.lacos.splice(Number(target.dataset.indice), 1);
    this.render();
  }

  static async #onVerItem(event, target) {
    const doc = await fromUuid(target.dataset.uuid);
    doc?.sheet.render(true);
  }

  /* -------------------------------------------- */
  /*  Aplicação                                    */
  /* -------------------------------------------- */

  static async #onAplicar() {
    const erros = PASSOS.flatMap(p => this.#validar()[p]);
    if (erros.length) {
      const ok = await DialogV2.confirm({
        window: { title: loc("LENDA.Assistente.AplicarComErrosTitulo") },
        content: `<p>${loc("LENDA.Assistente.AplicarComErros")}</p><ul>${erros.map(x => `<li>${x}</li>`).join("")}</ul>`
      });
      if (!ok) return;
    }
    await this.#aplicar();
    ui.notifications.info(loc("LENDA.Assistente.Concluido", { nome: this.actor.name }));
    this.close();
    this.actor.sheet.render(true);
  }

  async #aplicar() {
    const e = this.estado;
    const L = this.#limites();
    const actor = this.actor;
    const fonte = this.#fonteRequisitos();
    const updates = {
      name: e.nome || actor.name,
      "system.conceito": e.conceito,
      "system.aura": LENDA.criacao.aura,
      "system.lacos": e.lacos.filter(l => l.trim()).map(nome => ({ nome, marcado: false })),
      "system.estilo.nome": e.estiloNome
    };
    for (const k of Object.keys(LENDA.atributos)) updates[`system.atributos.${k}`] = fonte.atributos[k];
    for (const k of Object.keys(LENDA.ocupacoes)) {
      updates[`system.ocupacoes.${k}.value`] = e.ocupacoes[k];
      updates[`system.ocupacoes.${k}.especializacoes`] = e.especializacoes[k];
    }
    for (const k of Object.keys(LENDA.estilo)) updates[`system.estilo.${k}`] = e.estilo[k];
    await actor.update(updates);

    if (e.substituir) {
      const remover = actor.items.filter(i => ["caminho", "trunfo", "tecnica"].includes(i.type)).map(i => i.id);
      if (remover.length) await actor.deleteEmbeddedDocuments("Item", remover);
    }

    const criar = [];
    const adicionar = async (uuid, mutar) => {
      const doc = await fromUuid(uuid);
      if (!doc) return;
      const data = doc.toObject();
      delete data._id;
      foundry.utils.setProperty(data, "_stats.compendiumSource", uuid);
      if (mutar) mutar(data);
      criar.push(data);
    };
    const caminho = this.indices.caminhos.find(c => c._id === e.caminho);
    if (caminho) await adicionar(caminho.uuid);
    for (const t of this.#trunfosEscolhidos()) {
      await adicionar(t.uuid, data => {
        if (e.elementos[t._id]) data.system.elemento = e.elementos[t._id];
        if (data.system.prodigio && e.prodigio) data.system.escolha = loc(LENDA.atributos[e.prodigio].label);
      });
    }
    const tecs = this.#tecnicasEscolhidas();
    for (const t of tecs) {
      await adicionar(t.uuid, data => {
        data.system.ehOugi = e.ougis.includes(t._id);
      });
    }
    // Médium conhece um Ritual de Invocação.
    if (L.medium && !tecs.some(t => /ritual de invoca/i.test(t.name))) {
      const inv = this.indices.tecnicas.find(t => /ritual de invoca/i.test(t.name));
      if (inv) await adicionar(inv.uuid);
    }
    if (criar.length) await actor.createEmbeddedDocuments("Item", criar);

    // Vigor cheio e sincronização inicial com os trunfos aplicados.
    await actor.update({
      "system.vigor.value": actor.system.vigor.max,
      "system.sincronizacao.value": actor.system.sincronizacao.inicial,
      "system.ferimentos.value": 0
    });
  }
}
