import { LENDA, SYSTEM_ID } from "../config.mjs";
import { ajustarTensao } from "../helpers/tensao.mjs";

const { DialogV2 } = foundry.applications.api;
const renderTemplate = (...args) => foundry.applications.handlebars.renderTemplate(...args);
const loc = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/* -------------------------------------------- */
/*  Utilidades                                   */
/* -------------------------------------------- */

/**
 * Avalia uma fórmula determinística (sem dados) como "@for + @aura + 2" ou "max(@for, @agi)".
 * @param {string} formula
 * @param {object} rollData
 * @returns {number}
 */
export function avaliarFormula(formula, rollData) {
  if (!formula || !String(formula).trim()) return 0;
  try {
    const expr = Roll.replaceFormulaData(String(formula), rollData, { missing: "0" });
    const valor = Roll.safeEval(expr);
    return Number.isFinite(valor) ? Math.floor(valor) : 0;
  } catch(err) {
    console.warn(`${SYSTEM_ID} | Fórmula inválida: ${formula}`, err);
    return 0;
  }
}

/** Troca a referência a Força em uma fórmula de dano por outro atributo (Finesse, Análise Tática...). */
function trocarAtributoDano(formula, abrev) {
  if (!abrev || abrev === "for") return formula;
  return String(formula ?? "").replace(/@for\b/g, `@${abrev}`);
}

function opcoesAtributos() {
  return Object.entries(LENDA.atributos).map(([k, v]) => ({ value: k, label: loc(v.label) }));
}

/** Lista de bônus possíveis para um teste (ocupações e estilo). */
function opcoesBonus(actor) {
  const s = actor.system;
  const grupos = [];
  if (s.ocupacoes) {
    grupos.push({ label: loc("LENDA.Ocupacoes"), opcoes: Object.entries(LENDA.ocupacoes).map(([k, label]) => ({
      value: `ocupacao.${k}`, label: `${loc(label)} (${s.ocupacoes[k].value})`
    })) });
  }
  if (s.estilo) {
    grupos.push({ label: loc("LENDA.EstiloDeLuta"), opcoes: Object.entries(LENDA.estilo).map(([k, cfg]) => ({
      value: `estilo.${k}`, label: `${loc(cfg.label)} (${s.estilo[k]})`
    })) });
  }
  const volta = actor.items.some(i => i.type === "trunfo" && /volta por cima/i.test(i.name));
  if (volta) grupos.push({ label: loc("LENDA.Trunfos"), opcoes: [{ value: "tensao", label: loc("LENDA.Teste.BonusTensao") }] });
  return grupos;
}

function valorBonus(actor, chave) {
  if (!chave) return 0;
  if (chave === "tensao") return game.settings.get(SYSTEM_ID, "tensao");
  const [grupo, k] = chave.split(".");
  if (grupo === "ocupacao") return actor.system.ocupacoes?.[k]?.value ?? 0;
  if (grupo === "estilo") return actor.system.estilo?.[k] ?? 0;
  return 0;
}

function nomeBonus(chave) {
  if (!chave) return "";
  if (chave === "tensao") return loc("LENDA.Tensao.Nome");
  const [grupo, k] = chave.split(".");
  if (grupo === "ocupacao") return loc(LENDA.ocupacoes[k]);
  if (grupo === "estilo") return loc(LENDA.estilo[k].label);
  return "";
}

/** Efeitos de características das armas para um tipo de ataque. */
function efeitosArma(arma, tipoAtaque) {
  const r = { vantagens: 0, dano: 0, vigor: 1, penetracao: 0, splash: 5, splashEfeito: null, nomes: [] };
  if (!arma) return r;
  for (const c of arma.system.caracteristicas) {
    const cfg = LENDA.caracteristicas[c];
    if (!cfg) continue;
    r.nomes.push(loc(cfg.label));
    if (cfg.vantagem?.includes(tipoAtaque)) r.vantagens += 1;
    if (cfg.dano) r.dano += cfg.dano;
    if (cfg.vigor) r.vigor = Math.max(r.vigor, cfg.vigor);
    if (cfg.penetracao) r.penetracao += cfg.penetracao;
    if (cfg.splash) { r.splash = Math.min(r.splash, cfg.splash); r.splashEfeito = cfg.splashEfeito; }
  }
  return r;
}

/* -------------------------------------------- */
/*  Janela de teste genérico                     */
/* -------------------------------------------- */

/**
 * Abre a janela de configuração de um teste.
 * @param {Actor} actor
 * @param {object} [preset]
 */
export async function abrirTeste(actor, preset = {}) {
  const s = actor.system;
  const ctx = {
    atributos: opcoesAtributos(),
    atributo: preset.atributo ?? "agilidade",
    grupos: opcoesBonus(actor),
    bonus: preset.bonus ?? "",
    sinc: s.sincronizacao?.value ?? 0,
    ehProtagonista: actor.type === "protagonista",
    conceitoDisponivel: actor.type === "protagonista" && !s.conceitoUsado,
    amor: !!s.emocoes?.amor,
    grupo: s.grupo?.vantagens ?? 0,
    instantaneo: !!s.instantaneo?.ativo,
    titulo: preset.titulo ?? ""
  };
  const content = await renderTemplate(`systems/${SYSTEM_ID}/templates/dialog/teste.hbs`, ctx);
  const resultado = await DialogV2.wait({
    window: { title: loc("LENDA.Teste.Titulo", { nome: actor.name }), icon: "fas fa-dice-d6" },
    classes: ["lenda", "lenda-dialog"],
    position: { width: 440 },
    content,
    rejectClose: false,
    buttons: [{
      action: "rolar", label: loc("LENDA.Teste.Rolar"), icon: "fas fa-dice", default: true,
      callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
    }, { action: "cancelar", label: loc("Cancel"), icon: "fas fa-times" }]
  });
  if (!resultado || resultado === "cancelar") return null;
  return executarTeste(actor, {
    atributo: resultado.atributo,
    bonusChave: resultado.bonus,
    bonusExtra: Number(resultado.bonusExtra) || 0,
    vantagens: Number(resultado.vantagens) || 0,
    desvantagens: Number(resultado.desvantagens) || 0,
    sinc: Number(resultado.sinc) || 0,
    trocas: Number(resultado.trocas) || 0,
    conceito: !!resultado.conceito,
    confianca: !!resultado.confianca,
    tensaoComDois: !!resultado.tensaoComDois,
    dificuldade: resultado.dificuldade !== "" && resultado.dificuldade !== null ? Number(resultado.dificuldade) : null,
    titulo: preset.titulo
  });
}

/* -------------------------------------------- */
/*  Execução do teste                            */
/* -------------------------------------------- */

/**
 * Executa um teste: rola, permite selecionar os dados e publica o resultado.
 * @param {Actor} actor
 * @param {object} o
 * @returns {Promise<object|null>}
 */
export async function executarTeste(actor, o = {}) {
  const s = actor.system;
  const protagonista = actor.type === "protagonista";
  const mods = s.modificadores ?? {};
  const avisos = [];

  // Sincronização gasta (pré-paga em técnicas) + bônus de emoções.
  const sincDisponivel = s.sincronizacao?.value ?? 0;
  const sincGasta = o.sincJaPaga ? 0 : Math.min(Math.max(0, o.sinc ?? 0), sincDisponivel);
  if (o.confianca && sincDisponivel - sincGasta < 1 && !o.sincJaPaga) {
    ui.notifications.warn(loc("LENDA.Aviso.SemSincronizacao"));
    o.confianca = false;
  }
  const custoConfianca = o.confianca ? 1 : 0;

  // Quantidade de dados.
  let base = o.dadosBase ?? s.dadosAtributo?.(o.atributo) ?? 0;
  const vantGrupo = s.grupo?.vantagens ?? 0;
  base += (o.vantagens ?? 0) - (o.desvantagens ?? 0) + vantGrupo;
  let tensaoImediata = 0;
  if (base < 2) {
    if (protagonista) tensaoImediata = 1;
    avisos.push(loc("LENDA.Teste.PoucosDados"));
    base = 2;
  }
  const trocas = Math.min(base, Math.max(0, o.trocas ?? 0));
  const d6 = base - trocas;
  const d10 = trocas + sincGasta + (o.sincPaga ?? 0) + (o.conceito ? 1 : 0) + (o.confianca ? 2 : 0) + (s.emocoes?.amor ? 1 : 0) + (o.d10Extra ?? 0);

  const termos = [];
  if (d6 > 0) termos.push(`${d6}d6`);
  if (d10 > 0) termos.push(`${d10}d10`);
  const roll = new Roll(termos.join(" + ") || "0");
  await roll.evaluate();

  const dados = [];
  for (const termo of roll.dice) {
    for (const r of termo.results) dados.push({ faces: termo.faces, valor: r.result, estado: "livre" });
  }
  // Seleção padrão: dois maiores.
  const ordem = dados.map((d, i) => i).sort((a, b) => dados[b].valor - dados[a].valor);
  ordem.slice(0, 2).forEach(i => (dados[i].estado = "total"));

  if (game.dice3d) {
    try { await game.dice3d.showForRoll(roll, game.user, true); } catch(err) { /* Dice So Nice opcional */ }
  }

  const bonus = valorBonus(actor, o.bonusChave) + (o.bonusExtra ?? 0);
  const tensaoComDois = !!(o.tensaoComDois || mods.tensaoComDois);
  if (game.settings.get(SYSTEM_ID, "selecaoManual")) {
    const ok = await selecionarDados(dados, { bonus, maxTotal: 2, protagonista, tensaoComDois, titulo: o.titulo });
    if (!ok) {
      // Fechou a janela: mantém a seleção padrão.
    }
  }

  // Apuração.
  const usados = dados.filter(d => d.estado === "total");
  const livres = dados.filter(d => d.estado === "livre");
  const descartados = dados.filter(d => d.estado === "descartado");
  const soma = usados.reduce((a, d) => a + d.valor, 0);
  const total = soma + bonus;
  const uns = livres.filter(d => d.valor === 1 || (tensaoComDois && d.valor === 2)).length;
  const seis = livres.filter(d => d.valor >= 6).length;
  const descartados5 = descartados.filter(d => d.valor >= 5).length;

  let ganhoSinc = 0;
  let ganhoTensao = tensaoImediata;
  if (protagonista) {
    ganhoTensao += uns;
    ganhoSinc = seis;
  } else {
    // Antagonistas e coadjuvantes não acumulam sincronização: 6+ livres aumentam a Tensão.
    ganhoTensao += seis;
  }

  // Atualiza recursos do ator.
  const updates = {};
  const deltaSinc = ganhoSinc - sincGasta - custoConfianca;
  if (deltaSinc && s.sincronizacao) updates["system.sincronizacao.value"] = Math.max(0, sincDisponivel + deltaSinc);
  if (o.conceito) updates["system.conceitoUsado"] = true;
  if (o.confianca) updates["system.emocoes.confianca"] = true;
  if (!foundry.utils.isEmpty(updates)) await actor.update(updates);
  if (ganhoTensao) {
    await ajustarTensao(ganhoTensao, { motivo: loc("LENDA.Tensao.MotivoDados", { nome: actor.name }), silencioso: !game.settings.get(SYSTEM_ID, "mensagensTensaoDados") });
  }

  const resultado = {
    actor, dados, usados, total, soma, bonus, bonusNome: nomeBonus(o.bonusChave), uns, seis,
    descartados: descartados.length, descartados5, ganhoSinc, ganhoTensao, sincGasta: sincGasta + (o.sincPaga ?? 0),
    avisos, dificuldade: o.dificuldade ?? null
  };
  if (o.dificuldade !== null && o.dificuldade !== undefined) resultado.sucesso = total >= o.dificuldade;
  if (o.semMensagem) return resultado;
  await publicarTeste(resultado, o);
  return resultado;
}

/**
 * Janela de seleção de dados. Clique em um dado para alternar entre total, livre e descartado.
 * @param {object[]} dados  Lista mutável de dados ({faces, valor, estado}).
 * @param {object} opcoes
 * @returns {Promise<boolean>}
 */
export async function selecionarDados(dados, { bonus = 0, maxTotal = 2, protagonista = true, tensaoComDois = false, modoTensao = false, titulo = "" } = {}) {
  const render = () => {
    const usados = dados.filter(d => d.estado === "total");
    const livres = dados.filter(d => d.estado === "livre");
    const total = usados.reduce((a, d) => a + d.valor, 0) + bonus;
    const uns = livres.filter(d => d.valor === 1 || (tensaoComDois && d.valor === 2)).length;
    const seis = livres.filter(d => d.valor >= 6).length;
    const dadosHtml = dados.map((d, i) => `<button type="button" class="dado d${d.faces} ${d.estado}${d.valor === 1 ? " um" : ""}${d.valor >= 6 ? " seis" : ""}" data-indice="${i}" data-tooltip="${loc(`LENDA.Dado.${d.estado}`)}">${d.valor}</button>`).join("");
    let resumo;
    if (modoTensao) {
      resumo = usados.length > 2 ? `<p class="aviso">${loc("LENDA.Tensao.TerceiroDado")}</p>` : "";
    } else {
      resumo = `
        <p>${loc("LENDA.Selecao.Tensao")}: <strong>+${uns}</strong> · ${protagonista ? loc("LENDA.Selecao.Sinc") : loc("LENDA.Selecao.TensaoNPC")}: <strong>+${seis}</strong></p>`;
    }
    return `
      <p class="dica">${loc(modoTensao ? "LENDA.Selecao.DicaTensao" : "LENDA.Selecao.Dica")}</p>
      <div class="dados-selecao">${dadosHtml}</div>
      <div class="selecao-total">${loc("LENDA.Total")}: <strong>${total}</strong>${bonus ? ` <span class="bonus">(${usados.map(d => d.valor).join(" + ") || 0} + ${bonus})</span>` : ""}</div>
      ${resumo}
      <p class="contagem">${loc("LENDA.Selecao.Contagem", { n: usados.length, max: maxTotal })}</p>`;
  };

  const resultado = await DialogV2.wait({
    window: { title: titulo || loc("LENDA.Selecao.Titulo"), icon: "fas fa-dice" },
    classes: ["lenda", "lenda-dialog", "lenda-selecao"],
    position: { width: 420 },
    content: `<div class="selecao-corpo">${render()}</div>`,
    rejectClose: false,
    buttons: [{ action: "ok", label: loc("LENDA.Selecao.Confirmar"), icon: "fas fa-check", default: true }],
    render: (event, dialog) => {
      const root = dialog?.element ?? dialog;
      const corpo = root.querySelector(".selecao-corpo");
      corpo.addEventListener("click", ev => {
        const btn = ev.target.closest("button.dado");
        if (!btn) return;
        const d = dados[Number(btn.dataset.indice)];
        const totais = dados.filter(x => x.estado === "total").length;
        if (d.estado === "livre") d.estado = totais < maxTotal ? "total" : "descartado";
        else if (d.estado === "total") d.estado = "descartado";
        else d.estado = "livre";
        corpo.innerHTML = render();
      });
    }
  });
  return resultado === "ok";
}

/* -------------------------------------------- */
/*  Publicação no chat                           */
/* -------------------------------------------- */

/**
 * Cria a mensagem de chat de um teste (incluindo ataques contra alvos).
 */
export async function publicarTeste(r, o = {}) {
  const actor = r.actor;
  const ataque = o.ataque ? { ...o.ataque } : null;
  if (ataque?.tipo) ataque.tipoNome = loc(LENDA.tiposAtaque[ataque.tipo]?.label ?? ataque.tipo);
  let alvos = [];
  if (ataque) {
    const alvoTokens = o.alvos ?? [...game.user.targets];
    alvos = alvoTokens.map(t => compararAlvo(t, r, ataque)).filter(Boolean);
  }
  const ctx = {
    actorNome: actor.name,
    actorImg: actor.img,
    actorUuid: actor.uuid,
    dados: r.dados, total: r.total, soma: r.soma, bonus: r.bonus, bonusNome: r.bonusNome ?? "",
    uns: r.uns ?? 0, seis: r.seis ?? 0, descartados: r.descartados ?? 0, descartados5: r.descartados5 ?? 0,
    ganhoSinc: r.ganhoSinc ?? 0, ganhoTensao: r.ganhoTensao ?? 0, sincGasta: r.sincGasta ?? 0,
    protagonista: actor.type === "protagonista",
    avisos: r.avisos ?? [], semRolagem: !!r.semRolagem,
    dificuldade: r.dificuldade, sucesso: r.sucesso ?? null, temDificuldade: r.dificuldade !== null && r.dificuldade !== undefined,
    titulo: o.titulo ?? loc("LENDA.Teste.Nome"),
    subtitulo: o.subtitulo ?? "",
    atributoNome: o.atributo ? loc(LENDA.atributos[o.atributo]?.label ?? "") : "",
    tecnica: o.tecnica ?? null,
    custo: o.custo ?? null,
    ataque,
    alvos,
    temAlvos: alvos.length > 0,
    algumSplash: alvos.some(a => a.splash),
    defesa: o.defesa ?? null,
    texto: o.texto ?? "",
    splashEscolhido: null,
    splashTexto: null
  };
  const flags = { tipo: ataque ? "ataque" : "teste", actorUuid: actor.uuid, total: r.total, ctx };
  const content = await renderTemplate(`systems/${SYSTEM_ID}/templates/chat/teste.hbs`, ctx);
  const data = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { [SYSTEM_ID]: flags }
  };
  if (!game.dice3d && !r.semRolagem) data.sound = CONFIG.sounds.dice;
  ChatMessage.applyRollMode(data, o.rollMode ?? game.settings.get("core", "rollMode"));
  return ChatMessage.create(data);
}

/** Compara um ataque com um token alvo. */
function compararAlvo(token, r, ataque) {
  const alvo = token.actor;
  if (!alvo) return null;
  const s = alvo.system;
  const ld = s.limiares?.defesa?.value ?? 0;
  const lpBase = s.limiares?.protecao?.value ?? 0;
  const lp = lpBase - (ataque.penetracao ?? 0);
  const acerto = ataque.acertoAutomatico ? true : r.total > ld;
  const margem = r.total - ld;
  const splashLimite = ataque.splash ?? 5;
  const splash = acerto && margem >= splashLimite;
  const dano = ataque.dano ?? 0;
  const fere = acerto && dano > lp;
  const af = alvo.afinidade;
  const fraco = !!(af && ataque.elemento && LENDA.elementoOposto[af.elemento] === ataque.elemento);
  const retaliacao = !acerto && ataque.tipo && LENDA.tiposAtaque[ataque.tipo]?.vulneravel ? LENDA.tiposAtaque[ataque.tipo].vulneravel : null;
  return {
    uuid: token.document?.uuid ?? token.uuid,
    nome: token.name ?? alvo.name,
    img: token.document?.texture?.src ?? alvo.img,
    ld, lp, margem, acerto, splash, fere, fraco,
    vigor: (ataque.vigor ?? 1) + (fraco ? 1 : 0),
    vigorBase: ataque.vigor ?? 1,
    retaliacao: retaliacao ? loc(LENDA.tiposAtaque[retaliacao].label) : null,
    aplicado: false
  };
}

/* -------------------------------------------- */
/*  Ataques e defesas simples                    */
/* -------------------------------------------- */

/**
 * Abre a janela de ataque (simples ou com técnica).
 * @param {Actor} actor
 * @param {object} preset
 * @param {string} [preset.tipo]   golpe | combo | agarrao | projetil
 * @param {Item} [preset.tecnica]
 */
export async function abrirAtaque(actor, { tipo = "golpe", tecnica = null } = {}) {
  if (tecnica) return usarTecnica(actor, tecnica);
  const s = actor.system;
  const armas = actor.armas;
  const ctx = {
    tipo, tipos: Object.entries(LENDA.tiposAtaque).map(([k, v]) => ({ value: k, label: loc(v.label) })),
    atributos: opcoesAtributos(), atributo: "agilidade",
    armas: armas.map(a => ({ value: a.id, label: `${a.name}${a.system.caracteristicas.length ? ` (${a.system.caracteristicas.map(c => loc(LENDA.caracteristicas[c]?.label ?? c)).join(", ")})` : ""}` })),
    sinc: s.sincronizacao?.value ?? 0,
    ehProtagonista: actor.type === "protagonista",
    conceitoDisponivel: actor.type === "protagonista" && !s.conceitoUsado,
    alvos: [...game.user.targets].map(t => t.name).join(", ")
  };
  const content = await renderTemplate(`systems/${SYSTEM_ID}/templates/dialog/ataque.hbs`, ctx);
  const res = await DialogV2.wait({
    window: { title: loc("LENDA.Ataque.Titulo", { nome: actor.name }), icon: "fas fa-hand-fist" },
    classes: ["lenda", "lenda-dialog"],
    position: { width: 440 },
    content,
    rejectClose: false,
    buttons: [{ action: "rolar", label: loc("LENDA.Teste.Rolar"), icon: "fas fa-dice", default: true,
      callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
    { action: "cancelar", label: loc("Cancel"), icon: "fas fa-times" }]
  });
  if (!res || res === "cancelar") return null;
  const t = res.tipo;
  const arma = res.arma ? actor.items.get(res.arma) : null;
  const ef = efeitosArma(arma, t);
  const rollData = actor.getRollData();
  let formula = LENDA.tiposAtaque[t].dano;
  formula = trocarAtributoDano(formula, res.atributoDano);
  let dano = avaliarFormula(formula, rollData) + (Number(res.danoExtra) || 0);
  if (arma) dano += 1 + ef.dano + (s.modificadores?.danoArmas ?? 0);
  const ataque = {
    tipo: t, dano, vigor: ef.vigor, penetracao: ef.penetracao, splash: ef.splash, splashEfeito: ef.splashEfeito,
    elemento: "", arma: arma?.name ?? null
  };
  return executarTeste(actor, {
    atributo: res.atributo,
    bonusChave: `estilo.${t}`,
    bonusExtra: Number(res.bonusExtra) || 0,
    vantagens: (Number(res.vantagens) || 0) + ef.vantagens,
    desvantagens: Number(res.desvantagens) || 0,
    sinc: Number(res.sinc) || 0,
    trocas: Number(res.trocas) || 0,
    conceito: !!res.conceito,
    titulo: loc("LENDA.Ataque.Simples", { tipo: loc(LENDA.tiposAtaque[t].label) }),
    subtitulo: arma ? arma.name : "",
    ataque
  });
}

/**
 * Defesa total: Esquiva (Agilidade + Evasão) ou Bloqueio (Força + Bloqueio).
 * @param {Actor} actor
 * @param {"esquiva"|"bloqueio"} tipo
 */
export async function defesaTotal(actor, tipo = "esquiva") {
  const esquiva = tipo === "esquiva";
  return executarTeste(actor, {
    atributo: esquiva ? "agilidade" : "forca",
    bonusChave: esquiva ? "estilo.evasao" : "estilo.bloqueio",
    titulo: loc(esquiva ? "LENDA.Defesa.Esquiva" : "LENDA.Defesa.Bloqueio"),
    defesa: { tipo, rotulo: loc(esquiva ? "LENDA.Defesa.NovoLD" : "LENDA.Defesa.NovoLP") }
  });
}

/* -------------------------------------------- */
/*  Técnicas                                     */
/* -------------------------------------------- */

/**
 * Calcula o custo em nagen de uma técnica para um ator.
 */
export function calcularCusto(actor, item, { arma = false, kiai = false, nagenExtra = 0, elemento = null } = {}) {
  const s = item.system;
  const partes = [{ rotulo: loc("LENDA.Custo.Base"), valor: s.nagen }];
  let custo = s.nagen;
  if (s.custoPorUso && s.usos > 0) {
    custo += s.custoPorUso * s.usos;
    partes.push({ rotulo: loc("LENDA.Custo.Repeticao", { n: s.usos }), valor: s.custoPorUso * s.usos });
  }
  if (arma) { custo += 1; partes.push({ rotulo: loc("LENDA.Custo.Arma"), valor: 1 }); }
  if (nagenExtra) { custo += nagenExtra; partes.push({ rotulo: loc("LENDA.Custo.Extra"), valor: nagenExtra }); }
  if (kiai) { custo -= 1; partes.push({ rotulo: loc("LENDA.Custo.Kiai"), valor: -1 }); }
  const el = elemento ?? s.elemento;
  const afinidades = actor.system.modificadores?.afinidades ?? [];
  const af = afinidades.find(a => a.elemento && a.elemento === el);
  if (af) { custo -= 1; partes.push({ rotulo: loc("LENDA.Custo.Afinidade", { nome: af.nome }), valor: -1 }); }
  if (s.ritual && actor.items.some(i => i.type === "trunfo" && /ritualista/i.test(i.name))) {
    custo -= 2; partes.push({ rotulo: loc("LENDA.Custo.Ritualista"), valor: -2 });
  }
  if (s.upgrades.includes("ressonancia")) {
    const antes = custo;
    custo = Math.max(1, custo - 1);
    if (custo !== antes) partes.push({ rotulo: loc("LENDA.Upgrade.ressonancia"), valor: custo - antes });
  }
  custo = Math.max(0, custo);
  const aceito = afinidades.find(a => a.tipo === "aceito");
  const vantagemAfinidade = !!(aceito && el && aceito.elemento === el);
  // Aceito com jasq usando técnica de outro elemento perde 1 Vigor.
  const elementais = ["agua", "ar", "fogo", "terra"];
  const vigorJasq = !!(aceito && actor.system.modificadores?.jasq && elementais.includes(el) && aceito.elemento !== el);
  return { custo, partes, vantagemAfinidade, vigorJasq };
}

/**
 * Usa uma técnica: janela de opções, pagamento do nagen, sincronização e (opcionalmente) jogada de ataque.
 * @param {Actor} actor
 * @param {Item} item
 */
export async function usarTecnica(actor, item) {
  const s = actor.system;
  const t = item.system;
  const tipoAtaque = t.tipoAtaque;
  const armas = actor.armas;
  const sincDisponivel = s.sincronizacao?.value ?? 0;
  const precisaElemento = t.elemento === "variavel";
  const elementoPadrao = precisaElemento ? (actor.afinidade?.elemento ?? "") : t.elemento;
  const ctx = {
    item, actor,
    sinc: sincDisponivel,
    custoBase: t.custoBase,
    nagenNota: t.nagenNota,
    limiar: s.limiares?.canalizacao?.value ?? 0,
    rodada: s.nagen?.rodada ?? 0,
    rolar: t.ataque.rolar,
    ehAtaque: !!tipoAtaque,
    atributos: opcoesAtributos(),
    atributo: LENDA.atributoPorAbrev[t.ataque.atributo] ?? "agilidade",
    tipos: Object.entries(LENDA.tiposAtaque).map(([k, v]) => ({ value: k, label: loc(v.label) })),
    tipo: tipoAtaque ?? "golpe",
    armas: armas.map(a => ({ value: a.id, label: a.name })),
    precisaElemento,
    elementos: Object.entries(LENDA.elementos).filter(([k]) => k && k !== "variavel").map(([k, v]) => ({ value: k, label: loc(v) })),
    elemento: elementoPadrao,
    temDano: !!t.ataque.dano,
    conceitoDisponivel: actor.type === "protagonista" && !s.conceitoUsado,
    ehProtagonista: actor.type === "protagonista",
    alvos: [...game.user.targets].map(tk => tk.name).join(", "),
    upgrades: t.upgrades.map(u => loc(LENDA.upgrades[u]?.label ?? u)).join(", "),
    ougi: t.ehOugi
  };
  const content = await renderTemplate(`systems/${SYSTEM_ID}/templates/dialog/tecnica.hbs`, ctx);

  const atualizarPreview = (form) => {
    const fd = new foundry.applications.ux.FormDataExtended(form).object;
    const c = calcularCusto(actor, item, { arma: !!fd.arma, kiai: !!fd.kiai, nagenExtra: Number(fd.nagenExtra) || 0, elemento: fd.elemento ?? elementoPadrao });
    const sinc = Math.min(Number(fd.sinc) || 0, sincDisponivel);
    const pagoSinc = Math.min(sinc, c.custo);
    const restante = c.custo - pagoSinc;
    const antes = s.nagen?.rodada ?? 0;
    const limiar = s.limiares?.canalizacao?.value ?? 0;
    let vigor = Math.max(0, antes + restante - limiar) - Math.max(0, antes - limiar);
    if (vigor > 0 && s.modificadores?.jasq) vigor += 1;
    if (c.vigorJasq) vigor += 1;
    const ativa = sinc >= 1 && restante === 0 && vigor === 0;
    const el = form.querySelector(".custo-preview");
    if (el) {
      el.innerHTML = `${loc("LENDA.Custo.Total")}: <strong>${c.custo}</strong> · ${loc("LENDA.Custo.PagoSinc")}: <strong>${pagoSinc}</strong> · ${loc("LENDA.Custo.Canalizado")}: <strong>${restante}</strong>
        <br>${loc("LENDA.Custo.Vigor")}: <strong class="${vigor ? "perda" : ""}">${vigor}</strong> · ${loc("LENDA.Custo.EfeitoSinc")}: <strong class="${ativa ? "ativo" : ""}">${ativa ? loc("Yes") : loc("No")}</strong>
        <div class="partes">${c.partes.map(p => `${p.rotulo} ${p.valor >= 0 ? "+" : ""}${p.valor}`).join(" · ")}</div>`;
    }
  };

  const res = await DialogV2.wait({
    window: { title: loc("LENDA.Tecnica.Usar", { nome: item.name }), icon: "fas fa-fire" },
    classes: ["lenda", "lenda-dialog"],
    position: { width: 480 },
    content,
    rejectClose: false,
    render: (event, dialog) => {
      const root = dialog?.element ?? dialog;
      const form = root.querySelector("form") ?? root;
      atualizarPreview(form);
      form.addEventListener("change", () => atualizarPreview(form));
      form.addEventListener("input", () => atualizarPreview(form));
    },
    buttons: [{ action: "usar", label: loc("LENDA.Tecnica.Confirmar"), icon: "fas fa-fire", default: true,
      callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
    { action: "cancelar", label: loc("Cancel"), icon: "fas fa-times" }]
  });
  if (!res || res === "cancelar") return null;
  return executarTecnica(actor, item, res);
}

/**
 * Executa a técnica com as opções escolhidas.
 */
export async function executarTecnica(actor, item, res) {
  const s = actor.system;
  const t = item.system;
  const elemento = res.elemento || (t.elemento === "variavel" ? "" : t.elemento);
  const arma = res.arma ? actor.items.get(res.arma) : null;
  const c = calcularCusto(actor, item, { arma: !!arma, kiai: !!res.kiai, nagenExtra: Number(res.nagenExtra) || 0, elemento });
  const sincDisponivel = s.sincronizacao?.value ?? 0;
  const sinc = Math.min(Math.max(0, Number(res.sinc) || 0), sincDisponivel);
  const pagoSinc = Math.min(sinc, c.custo);
  const restante = c.custo - pagoSinc;
  const antes = s.nagen?.rodada ?? 0;
  const limiar = s.limiares?.canalizacao?.value ?? 0;
  let vigorPerdido = Math.max(0, antes + restante - limiar) - Math.max(0, antes - limiar);
  if (vigorPerdido > 0 && s.modificadores?.jasq) vigorPerdido += 1;
  if (c.vigorJasq) vigorPerdido += 1;
  const sincAtivada = sinc >= 1 && restante === 0 && vigorPerdido === 0;

  // Paga os custos.
  const updates = {};
  if (s.sincronizacao) updates["system.sincronizacao.value"] = sincDisponivel - sinc;
  if (s.nagen) updates["system.nagen.rodada"] = antes + restante;
  if (!foundry.utils.isEmpty(updates)) await actor.update(updates);
  if (vigorPerdido) await actor.perderVigor(vigorPerdido, { motivo: loc("LENDA.Custo.Excesso") });
  if (actor.type === "espirito" && restante) {
    await actor.update({ "system.reserva.value": Math.max(0, s.reserva.value - restante) });
  }
  const itemUpdates = {};
  if (t.custoPorUso) itemUpdates["system.usos"] = t.usos + 1;
  // Técnicas que duram (até o fim da cena, até o próximo turno...) ficam marcadas como ativas.
  if (["acao", "acaoExtra", "livre"].includes(t.acao) && !t.ehAtaque && !t.ataque.dano && /cena|turno|dissipad/i.test(t.descricao)) itemUpdates["system.ativa"] = true;
  if (!foundry.utils.isEmpty(itemUpdates)) await item.update(itemUpdates);

  const custo = { ...c, sinc, pagoSinc, restante, vigorPerdido, sincAtivada, antes, depois: antes + restante, limiar };

  // Dano.
  const rollData = actor.getRollData();
  let dano = null;
  let ataque = null;
  if (t.ataque.dano) {
    let formula = t.ataque.dano;
    if (t.upgrades.includes("finesse")) formula = trocarAtributoDano(formula, "agi");
    formula = trocarAtributoDano(formula, res.atributoDano);
    dano = avaliarFormula(formula, rollData);
    if (t.ehOugi && t.ataque.danoOugi) dano += avaliarFormula(t.ataque.danoOugi, rollData);
    if (sincAtivada && t.ataque.danoSinc) dano += avaliarFormula(t.ataque.danoSinc, rollData);
    if (t.upgrades.includes("poder")) dano += Math.max(2, s.aura ?? 0);
    if (t.perfeicao) dano += 1;
    if (elemento === "fogo") dano += s.modificadores?.danoFogo ?? 0;
    if (sincAtivada && Number(res.nagenExtra)) dano += Number(res.nagenExtra);
    dano += Number(res.danoExtra) || 0;
  }
  const tipoAtaque = res.tipo || t.tipoAtaque;
  const ef = efeitosArma(arma, tipoAtaque);
  if (dano !== null && arma) dano += 1 + ef.dano + (s.modificadores?.danoArmas ?? 0);

  const ehAtaque = !!res.rolar;
  if (dano !== null || ehAtaque) {
    ataque = {
      tipo: ehAtaque ? tipoAtaque : null,
      dano: dano ?? 0,
      vigor: Math.max(t.ataque.vigorPorAcerto || 1, ef.vigor),
      penetracao: ef.penetracao,
      splash: Math.min(ef.splash, t.perfeicao ? 4 : 5),
      splashEfeito: ef.splashEfeito,
      elemento,
      danoPorDescarte: t.ataque.danoPorDescarte,
      acertoAutomatico: !ehAtaque,
      ignorarBonusProtecao: /corte perfeito/i.test(t.origem || item.name),
      arma: arma?.name ?? null
    };
  }

  const texto = {
    descricao: await foundry.applications.ux.TextEditor.implementation.enrichHTML(t.descricao, { relativeTo: item, secrets: item.isOwner }),
    ougi: t.ehOugi ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(t.ougi, { relativeTo: item }) : "",
    sincronizacao: sincAtivada ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(t.sincronizacao, { relativeTo: item }) : ""
  };
  const meta = {
    tecnica: { nome: item.name, img: item.img, acao: loc(LENDA.acoes[t.acao] ?? ""), elemento: elemento ? loc(LENDA.elementos[elemento]) : "", ehOugi: t.ehOugi, texto, upgrades: t.upgrades.map(u => loc(LENDA.upgrades[u]?.label ?? u)) },
    custo
  };

  if (!ehAtaque) {
    // Sem jogada de ataque: publica o uso (com dano automático, se houver).
    const r = { actor, dados: [], usados: [], total: 0, soma: 0, bonus: 0, avisos: [], semRolagem: true };
    return publicarTeste(r, { titulo: item.name, ...meta, ataque, texto: "" });
  }

  let vantagens = (Number(res.vantagens) || 0) + (t.ataque.vantagens || 0) + ef.vantagens;
  if (t.ehOugi) vantagens += t.ataque.vantagensOugi || 0;
  if (t.upgrades.includes("precisao")) vantagens += 1;
  if (t.perfeicao) vantagens += 1;
  if (c.vantagemAfinidade) vantagens += 1;
  let desvantagens = Number(res.desvantagens) || 0;
  if (vantagens < 0) { desvantagens += -vantagens; vantagens = 0; }

  const r = await executarTeste(actor, {
    atributo: res.atributo,
    bonusChave: tipoAtaque ? `estilo.${tipoAtaque}` : "",
    bonusExtra: Number(res.bonusExtra) || 0,
    vantagens, desvantagens,
    sincPaga: sinc,
    sincJaPaga: true,
    trocas: Number(res.trocas) || 0,
    conceito: !!res.conceito,
    titulo: item.name,
    semMensagem: true
  });
  if (!r) return null;
  if (ataque && ataque.danoPorDescarte && r.descartados5) {
    ataque.dano += r.descartados5 * ataque.danoPorDescarte;
    ataque.bonusDescarte = r.descartados5 * ataque.danoPorDescarte;
  }
  return publicarTeste(r, { titulo: item.name, atributo: res.atributo, ...meta, ataque });
}

/* -------------------------------------------- */
/*  Pilha de Tensão                              */
/* -------------------------------------------- */

export async function rolarPilhaTensao() {
  if (!game.user.isGM) return;
  const tensao = game.settings.get(SYSTEM_ID, "tensao");
  if (tensao < 1) {
    ui.notifications.warn(loc("LENDA.Aviso.TensaoZero"));
    return;
  }
  const roll = new Roll(`${tensao}d6`);
  await roll.evaluate();
  const dados = roll.dice[0].results.map(r => ({ faces: 6, valor: r.result, estado: "livre" }));
  dados.map((d, i) => i).sort((a, b) => dados[b].valor - dados[a].valor).slice(0, 2).forEach(i => (dados[i].estado = "total"));
  if (game.dice3d) {
    try { await game.dice3d.showForRoll(roll, game.user, true, ChatMessage.getWhisperRecipients("GM").map(u => u.id), !game.settings.get(SYSTEM_ID, "tensaoPublica")); } catch(err) { /* opcional */ }
  }
  await selecionarDados(dados, { maxTotal: 3, modoTensao: true, titulo: loc("LENDA.Tensao.Rolar") });
  const usados = dados.filter(d => d.estado === "total");
  const total = usados.reduce((a, d) => a + d.valor, 0);
  const terceiro = usados.length > 2;
  if (terceiro) await ajustarTensao(-1, { motivo: loc("LENDA.Tensao.TerceiroDado"), silencioso: true });
  const content = await renderTemplate(`systems/${SYSTEM_ID}/templates/chat/tensao.hbs`, { dados, total, terceiro, tensao: terceiro ? tensao - 1 : tensao });
  const data = { content, speaker: { alias: loc("LENDA.Tensao.Nome") } };
  if (!game.settings.get(SYSTEM_ID, "tensaoPublica")) data.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
  if (!game.dice3d) data.sound = CONFIG.sounds.dice;
  return ChatMessage.create(data);
}
