import { LENDA, SYSTEM_ID } from "../config.mjs";
import { ajustarTensao } from "../helpers/tensao.mjs";

/**
 * Documento de Ator do sistema.
 */
export class LendaActor extends Actor {

  /** @override */
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    const updates = {};
    if (!data.img || data.img === "icons/svg/mystery-man.svg") updates.img = "icons/svg/mystery-man.svg";
    const bar = this.type === "espirito" ? "reserva" : "vigor";
    updates["prototypeToken.bar1.attribute"] = foundry.utils.getProperty(data, "prototypeToken.bar1.attribute") ?? bar;
    updates["prototypeToken.displayBars"] = foundry.utils.getProperty(data, "prototypeToken.displayBars") ?? CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER;
    // Personagens novos começam com Vigor cheio e a sincronização inicial.
    if (this.system?.vigor && foundry.utils.getProperty(data, "system.vigor.value") === undefined) {
      updates["system.vigor.value"] = this.system.vigor.max;
    }
    if (this.type === "espirito" && foundry.utils.getProperty(data, "system.reserva.value") === undefined) {
      updates["system.reserva.value"] = this.system.reserva.max;
    }
    if (this.type === "protagonista" && foundry.utils.getProperty(data, "system.sincronizacao.value") === undefined) {
      updates["system.sincronizacao.value"] = this.system.sincronizacao.inicial;
    }
    if (this.type === "protagonista") {
      updates["prototypeToken.actorLink"] = true;
      updates["prototypeToken.disposition"] = CONST.TOKEN_DISPOSITIONS.FRIENDLY;
    }
    this.updateSource(updates);
  }

  /** @override */
  getRollData() {
    const s = this.system;
    const data = {
      aura: s.aura ?? 0,
      atributos: s.atributos ? { ...s.atributos } : {},
      estilo: s.estilo ? { ...s.estilo } : {},
      ocupacoes: s.ocupacoes ? Object.fromEntries(Object.entries(s.ocupacoes).map(([k, v]) => [k, v.value])) : {},
      vigor: s.vigor ? { value: s.vigor.value, max: s.vigor.max } : {},
      limiares: s.limiares ? Object.fromEntries(Object.entries(s.limiares).map(([k, v]) => [k, v.value])) : {}
    };
    // Atalhos usados nas fórmulas de dano: @for, @raz, @ins, @agi, @pre, @von.
    let fixo = null;
    if (this.type === "espirito") fixo = s.dados;
    else if (this.type === "coadjuvante" && s.instantaneo?.ativo) fixo = s.instantaneo.dados;
    for (const [key, cfg] of Object.entries(LENDA.atributos)) {
      data[cfg.short] = fixo ?? s.atributos?.[key] ?? 0;
      if (fixo !== null) data.atributos[key] = fixo;
    }
    return data;
  }

  /* -------------------------------------------- */
  /*  Atalhos de estado                            */
  /* -------------------------------------------- */

  /** Este ator gera sincronização (e não Tensão) com resultados 6+? */
  get geraSincronizacao() {
    return this.type === "protagonista";
  }

  /** Técnicas do ator. */
  get tecnicas() {
    return this.items.filter(i => i.type === "tecnica");
  }

  /** Caminho atual do protagonista. */
  get caminho() {
    return this.items.find(i => i.type === "caminho") ?? null;
  }

  /** Afinidade elemental do ator: {tipo, elemento} ou null. */
  get afinidade() {
    const af = this.system.modificadores?.afinidades ?? [];
    return af.find(a => a.tipo === "aceito") ?? af[0] ?? null;
  }

  /** Armas utilizáveis (equipadas). */
  get armas() {
    return this.items.filter(i => i.type === "equipamento" && i.system.equipado && i.system.ehArma);
  }

  /* -------------------------------------------- */
  /*  Recursos                                     */
  /* -------------------------------------------- */

  /**
   * Ajusta a pilha de sincronização.
   * @param {number} delta
   */
  async ajustarSincronizacao(delta) {
    if (!this.system.sincronizacao) return;
    const value = Math.max(0, this.system.sincronizacao.value + delta);
    return this.update({ "system.sincronizacao.value": value });
  }

  /**
   * Faz o ator perder Vigor (por esforço ou por ser atingido) e marca ferimentos quando a barra se esgota.
   * @param {number} quantidade
   * @param {object} [opcoes]
   * @param {string} [opcoes.motivo]
   * @returns {Promise<object>} Resumo do que aconteceu.
   */
  async perderVigor(quantidade, { motivo = "" } = {}) {
    if (this.type === "espirito") return this.sofrerAtaqueEspirito({ vigor: quantidade, ferimento: false });
    const atual = this.system.vigor.value;
    const novo = atual - quantidade;
    const resumo = { vigor: quantidade, ferimentos: 0, motivo };
    const updates = { "system.vigor.value": Math.max(0, novo) };
    await this.update(updates);
    if (quantidade > 0 && novo <= 0) {
      // Esgotar a Barra de Vigor (ou perder Vigor com ela vazia) deixa o personagem ferido.
      const r = await this.marcarFerimento(1, { motivo: game.i18n.localize("LENDA.Chat.VigorEsgotado") });
      resumo.ferimentos += r.marcados;
      resumo.derrotado = r.derrotado;
      resumo.auraDissipada = r.auraDissipada;
    }
    return resumo;
  }

  /**
   * Marca caixas de ferimento, respeitando Aura de Batalha e grupos de coadjuvantes.
   * @param {number} n
   * @returns {Promise<{marcados:number, derrotado:boolean, auraDissipada:boolean, membroRemovido:boolean}>}
   */
  async marcarFerimento(n = 1, { motivo = "", ignorarAura = false } = {}) {
    const resultado = { marcados: 0, derrotado: false, auraDissipada: false, membroRemovido: false };
    for (let i = 0; i < n; i++) {
      // Aura de Batalha absorve o ferimento.
      const aura = ignorarAura ? null : this.items.find(it => it.type === "tecnica" && it.system.ativa && /aura de batalha/i.test(it.system.origem || it.name));
      if (aura) {
        await aura.update({ "system.ativa": false });
        resultado.auraDissipada = true;
        continue;
      }
      // Grupos de coadjuvantes perdem um membro.
      if (this.type === "coadjuvante" && this.system.grupo?.ativo && this.system.grupo.tamanho > 1) {
        await this.update({ "system.grupo.tamanho": this.system.grupo.tamanho - 1 });
        resultado.membroRemovido = true;
        continue;
      }
      const value = this.system.ferimentos.value + 1;
      await this.update({ "system.ferimentos.value": value });
      resultado.marcados++;
      if (value > this.system.ferimentos.max) resultado.derrotado = true;
    }
    if (resultado.derrotado) await this._marcarDerrotado(true);
    return resultado;
  }

  async _marcarDerrotado(estado) {
    const status = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
    try {
      await this.toggleStatusEffect(status, { active: estado, overlay: true });
    } catch(err) {
      console.warn(`${SYSTEM_ID} | Não foi possível alternar o status de derrotado`, err);
    }
  }

  /**
   * Aplica o resultado de um ataque que acertou.
   * @param {object} dados
   * @param {number} dados.dano             Dano do ataque.
   * @param {number} [dados.vigor=1]        Vigor perdido por ser atingido.
   * @param {string} [dados.elemento]       Afinidade do ataque.
   * @param {number} [dados.penetracao=0]   Redução no Limiar de Proteção.
   * @param {number} [dados.protecao]       Limiar de Proteção a usar (ex.: após um Bloqueio).
   * @param {number} [dados.ferimentos=1]   Caixas marcadas se o dano superar o Limiar de Proteção.
   * @param {boolean} [dados.ignorarBonusProtecao] Corte Perfeito: só valores naturais.
   */
  async sofrerAtaque({ dano = 0, vigor = 1, elemento = "", penetracao = 0, protecao = null, ferimentos = 1, ignorarBonusProtecao = false } = {}) {
    if (this.type === "espirito") return this.sofrerAtaqueEspirito({ dano, vigor });
    let perda = vigor;
    const af = this.afinidade;
    const fraco = af && elemento && LENDA.elementoOposto[af.elemento] === elemento;
    if (fraco) perda += 1;
    let lp = protecao ?? this.system.limiares.protecao.value;
    if (ignorarBonusProtecao && protecao === null) lp = this.system.aura + this.system.atributos.forca + this.system.estilo.bloqueio;
    lp -= penetracao;
    const fere = dano > lp;
    const resumo = { dano, protecao: lp, vigor: perda, fraco, ferimentos: 0, derrotado: false, auraDissipada: false, membroRemovido: false };
    if (fere) {
      const r = await this.marcarFerimento(ferimentos);
      resumo.ferimentos += r.marcados;
      resumo.derrotado ||= r.derrotado;
      resumo.auraDissipada ||= r.auraDissipada;
      resumo.membroRemovido ||= r.membroRemovido;
    }
    const v = await this.perderVigor(perda);
    resumo.ferimentos += v.ferimentos ?? 0;
    resumo.derrotado ||= !!v.derrotado;
    return resumo;
  }

  /** Espíritos usam a Reserva como Barra de Vigor e Limiar de Proteção; ferimentos reduzem a Aura. */
  async sofrerAtaqueEspirito({ dano = 0, vigor = 1 } = {}) {
    const s = this.system;
    const fere = dano > s.reserva.value;
    const updates = { "system.reserva.value": Math.max(0, s.reserva.value - vigor) };
    const resumo = { dano, protecao: s.reserva.value, vigor, ferimentos: 0, derrotado: false };
    if (fere) {
      updates["system.aura"] = Math.max(0, s.aura - 1);
      resumo.ferimentos = 1;
      resumo.auraReduzida = true;
      if (updates["system.aura"] === 0) resumo.derrotado = true;
    }
    await this.update(updates);
    return resumo;
  }

  /** Remove todos os ferimentos (poder da esperança, karma, cena de recuperação). */
  async curarFerimentos({ vigorCheio = false } = {}) {
    const updates = { "system.ferimentos.value": 0 };
    if (vigorCheio) updates["system.vigor.value"] = this.system.vigor.max;
    await this.update(updates);
    await this._marcarDerrotado(false);
  }

  /* -------------------------------------------- */
  /*  Cena e sessão                                */
  /* -------------------------------------------- */

  /**
   * Prepara o personagem para uma nova cena: vigor cheio, sincronização inicial, nagen e emoções zerados.
   */
  async novaCena() {
    if (this.type === "espirito") {
      return this.update({ "system.reserva.value": this.system.reserva.max });
    }
    const s = this.system;
    const updates = {
      "system.vigor.value": s.vigor.max,
      "system.nagen.rodada": 0,
      "system.emocoes.amor": false,
      "system.emocoes.esperanca": 0,
      "system.emocoes.confianca": false,
      "system.emocoes.raiva": false
    };
    if (this.geraSincronizacao) updates["system.sincronizacao.value"] = s.sincronizacao.inicial;
    else updates["system.sincronizacao.value"] = 0;
    // Jasq consome um ponto de Vigor no começo de cada cena.
    const porCena = s.modificadores?.vigorPorCena ?? 0;
    if (porCena) updates["system.vigor.value"] = Math.max(0, s.vigor.max - porCena);
    await this.update(updates);
    const itemUpdates = this.items
      .filter(i => i.type === "tecnica" && (i.system.usos || i.system.ativa))
      .map(i => ({ _id: i.id, "system.usos": 0, "system.ativa": false }));
    if (itemUpdates.length) await this.updateEmbeddedDocuments("Item", itemUpdates);
  }

  /** Zera o nagen canalizado na rodada. */
  async novaRodada() {
    if (this.system.nagen?.rodada) await this.update({ "system.nagen.rodada": 0 });
  }

  /**
   * Fim de sessão: calcula karma de caminho, laços e participação, e limpa as marcas.
   */
  async encerrarSessao() {
    if (this.type !== "protagonista") return;
    const s = this.system;
    const caminho = this.caminho;
    const eventos = caminho ? caminho.system.eventos.filter(e => e.marcado).length : 0;
    const reviravolta = caminho?.system.reviravolta.marcado ?? false;
    const lacos = s.lacos.filter(l => l.marcado).length;
    const ganho = eventos + lacos + 1 + (reviravolta ? 2 : 0);
    await this.update({
      "system.karma.value": s.karma.value + ganho,
      "system.karma.total": s.karma.total + ganho,
      "system.lacos": s.lacos.map(l => ({ ...l, marcado: false })),
      "system.conceitoUsado": false
    });
    if (caminho) {
      await caminho.update({ "system.eventos": caminho.system.eventos.map(e => ({ ...e, marcado: false })) });
    }
    const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/chat/sessao.hbs`, {
      actor: this, eventos, lacos, reviravolta, ganho, karma: s.karma.value + ganho,
      avancosPossiveis: Math.floor((s.karma.value + ganho) / 5)
    });
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content });
  }

  /**
   * Compra avanços com karma (5 karma cada). A cada 5 avanços a Aura aumenta.
   * @param {number} quantidade
   */
  async comprarAvancos(quantidade = 1) {
    const s = this.system;
    const custo = quantidade * 5;
    if (s.karma.value < custo) {
      ui.notifications.warn(game.i18n.localize("LENDA.Aviso.KarmaInsuficiente"));
      return;
    }
    const antes = s.avancos.value;
    const depois = antes + quantidade;
    const subidas = Math.floor(depois / 5) - Math.floor(antes / 5);
    const updates = { "system.karma.value": s.karma.value - custo, "system.avancos.value": depois };
    if (subidas > 0) updates["system.aura"] = s.aura + subidas;
    await this.update(updates);
    const msg = game.i18n.format("LENDA.Chat.AvancosComprados", { nome: this.name, n: quantidade });
    const aura = subidas > 0 ? ` ${game.i18n.format("LENDA.Chat.AuraAumentou", { aura: s.aura + subidas })}` : "";
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<p>${msg}${aura}</p>` });
  }

  /**
   * Desmarca um laço para ganhar um dado de sincronização.
   * @param {number} index
   */
  async invocarLaco(index) {
    const lacos = foundry.utils.deepClone(this.system.lacos);
    const laco = lacos[index];
    if (!laco?.marcado) {
      ui.notifications.warn(game.i18n.localize("LENDA.Aviso.LacoNaoMarcado"));
      return;
    }
    laco.marcado = false;
    await this.update({ "system.lacos": lacos, "system.sincronizacao.value": this.system.sincronizacao.value + 1 });
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<p>${game.i18n.format("LENDA.Chat.LacoInvocado", { nome: this.name, laco: laco.nome || "—" })}</p>`
    });
  }

  /**
   * Invoca o poder de uma emoção.
   * @param {"amor"|"esperanca"|"confianca"|"raiva"} emocao
   */
  async invocarEmocao(emocao) {
    const s = this.system;
    const limiteEsperanca = this.items.some(i => i.type === "trunfo" && /incans/i.test(i.name)) ? 2 : 1;
    const usada = emocao === "esperanca" ? s.emocoes.esperanca >= limiteEsperanca : s.emocoes[emocao];
    if (usada) {
      ui.notifications.warn(game.i18n.localize("LENDA.Aviso.EmocaoUsada"));
      return;
    }
    // Aceitos derrotados pelo elemento oposto precisam de 2 dados para a esperança — o jogador decide.
    const custo = 1;
    if (s.sincronizacao.value < custo) {
      ui.notifications.warn(game.i18n.localize("LENDA.Aviso.SemSincronizacao"));
      return;
    }
    const updates = { "system.sincronizacao.value": s.sincronizacao.value - custo };
    if (emocao === "esperanca") updates["system.emocoes.esperanca"] = s.emocoes.esperanca + 1;
    else updates[`system.emocoes.${emocao}`] = true;
    await this.update(updates);
    if (emocao === "esperanca") await this.curarFerimentos({ vigorCheio: true });
    const cfg = LENDA.emocoes[emocao];
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="lenda-chat emocao ${emocao}"><h3><i class="fas ${cfg.icon}"></i> ${game.i18n.localize(cfg.label)}</h3><p>${game.i18n.localize(cfg.hint)}</p></div>`
    });
  }

  /**
   * Usa a Tensão para ajudar um coadjuvante/antagonista (apenas narrador).
   * @param {"vantagem"|"sincronizacao"} tipo
   */
  async comprarComTensao(tipo) {
    if (!game.user.isGM) return;
    const custo = tipo === "sincronizacao" ? 2 : 1;
    const tensao = game.settings.get(SYSTEM_ID, "tensao");
    if (tensao < custo) {
      ui.notifications.warn(game.i18n.localize("LENDA.Aviso.TensaoInsuficiente"));
      return;
    }
    await ajustarTensao(-custo, { motivo: game.i18n.format(tipo === "sincronizacao" ? "LENDA.Tensao.CompraSinc" : "LENDA.Tensao.CompraVantagem", { nome: this.name }), voluntario: false });
    if (tipo === "sincronizacao") await this.ajustarSincronizacao(1);
  }
}
