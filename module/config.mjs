/**
 * Configuração estática do sistema A Lenda do Dragão de Fogo.
 */
export const SYSTEM_ID = "lenda-dragao-fogo";

export const LENDA = {};

LENDA.atributos = {
  forca: { label: "LENDA.Atributo.forca", abbr: "FOR", short: "for" },
  razao: { label: "LENDA.Atributo.razao", abbr: "RAZ", short: "raz" },
  instinto: { label: "LENDA.Atributo.instinto", abbr: "INS", short: "ins" },
  agilidade: { label: "LENDA.Atributo.agilidade", abbr: "AGI", short: "agi" },
  presenca: { label: "LENDA.Atributo.presenca", abbr: "PRE", short: "pre" },
  vontade: { label: "LENDA.Atributo.vontade", abbr: "VON", short: "von" }
};

/** Mapa das abreviações usadas em fórmulas (@for, @agi...) para a chave do atributo. */
LENDA.atributoPorAbrev = Object.fromEntries(Object.entries(LENDA.atributos).map(([k, v]) => [v.short, k]));

LENDA.ocupacoes = {
  artista: "LENDA.Ocupacao.artista",
  atleta: "LENDA.Ocupacao.atleta",
  cientista: "LENDA.Ocupacao.cientista",
  diplomata: "LENDA.Ocupacao.diplomata",
  engenheiro: "LENDA.Ocupacao.engenheiro",
  medico: "LENDA.Ocupacao.medico",
  mistico: "LENDA.Ocupacao.mistico",
  piloto: "LENDA.Ocupacao.piloto",
  trapaceiro: "LENDA.Ocupacao.trapaceiro",
  vigilante: "LENDA.Ocupacao.vigilante"
};

LENDA.niveisOcupacao = {
  0: "LENDA.NivelOcupacao.0",
  1: "LENDA.NivelOcupacao.1",
  2: "LENDA.NivelOcupacao.2",
  3: "LENDA.NivelOcupacao.3"
};

LENDA.estilo = {
  agarrao: { label: "LENDA.Estilo.agarrao", ataque: true, icon: "agarrao" },
  bloqueio: { label: "LENDA.Estilo.bloqueio", ataque: false, icon: "bloqueio" },
  combo: { label: "LENDA.Estilo.combo", ataque: true, icon: "combo" },
  evasao: { label: "LENDA.Estilo.evasao", ataque: false, icon: "evasao" },
  golpe: { label: "LENDA.Estilo.golpe", ataque: true, icon: "golpe" },
  projetil: { label: "LENDA.Estilo.projetil", ataque: true, icon: "projetil" }
};

/** Tipos de ataque: atributo de dano padrão de um ataque simples. */
LENDA.tiposAtaque = {
  golpe: { label: "LENDA.Estilo.golpe", dano: "@for", retalia: "agarrao", vulneravel: "combo" },
  combo: { label: "LENDA.Estilo.combo", dano: "max(@for, @agi)", retalia: "golpe", vulneravel: "agarrao" },
  agarrao: { label: "LENDA.Estilo.agarrao", dano: "@for", retalia: "combo", vulneravel: "golpe" },
  projetil: { label: "LENDA.Estilo.projetil", dano: "@ins", retalia: null, vulneravel: null }
};

LENDA.elementos = {
  "": "LENDA.Elemento.nenhum",
  agua: "LENDA.Elemento.agua",
  ar: "LENDA.Elemento.ar",
  fogo: "LENDA.Elemento.fogo",
  terra: "LENDA.Elemento.terra",
  eter: "LENDA.Elemento.eter",
  variavel: "LENDA.Elemento.variavel"
};

LENDA.elementoOposto = { agua: "fogo", fogo: "agua", ar: "terra", terra: "ar" };

LENDA.acoes = {
  acao: "LENDA.Acao.acao",
  acaoExtra: "LENDA.Acao.acaoExtra",
  reacao: "LENDA.Acao.reacao",
  livre: "LENDA.Acao.livre",
  passiva: "LENDA.Acao.passiva",
  ritual: "LENDA.Acao.ritual"
};

LENDA.afinidades = {
  "": "LENDA.Afinidade.nenhuma",
  tocado: "LENDA.Afinidade.tocado",
  aceito: "LENDA.Afinidade.aceito"
};

LENDA.upgrades = {
  finesse: { label: "LENDA.Upgrade.finesse", hint: "LENDA.Upgrade.finesseHint" },
  invencibilidade: { label: "LENDA.Upgrade.invencibilidade", hint: "LENDA.Upgrade.invencibilidadeHint" },
  poder: { label: "LENDA.Upgrade.poder", hint: "LENDA.Upgrade.poderHint" },
  precisao: { label: "LENDA.Upgrade.precisao", hint: "LENDA.Upgrade.precisaoHint" },
  preparacao: { label: "LENDA.Upgrade.preparacao", hint: "LENDA.Upgrade.preparacaoHint" },
  quebraGuarda: { label: "LENDA.Upgrade.quebraGuarda", hint: "LENDA.Upgrade.quebraGuardaHint" },
  ressonancia: { label: "LENDA.Upgrade.ressonancia", hint: "LENDA.Upgrade.ressonanciaHint" },
  retribuicao: { label: "LENDA.Upgrade.retribuicao", hint: "LENDA.Upgrade.retribuicaoHint" },
  versatilidade: { label: "LENDA.Upgrade.versatilidade", hint: "LENDA.Upgrade.versatilidadeHint" }
};

LENDA.categoriasEquipamento = {
  arma: "LENDA.Equipamento.arma",
  artefato: "LENDA.Equipamento.artefato",
  implante: "LENDA.Equipamento.implante",
  armadura: "LENDA.Equipamento.armadura",
  outro: "LENDA.Equipamento.outro"
};

/** Características de armas (cap. 6). */
LENDA.caracteristicas = {
  arremessavel: { label: "LENDA.Caracteristica.arremessavel", hint: "LENDA.Caracteristica.arremessavelHint" },
  debilitante: { label: "LENDA.Caracteristica.debilitante", hint: "LENDA.Caracteristica.debilitanteHint", splash: 4, splashEfeito: "empecilho" },
  defensiva: { label: "LENDA.Caracteristica.defensiva", hint: "LENDA.Caracteristica.defensivaHint" },
  dupla: { label: "LENDA.Caracteristica.dupla", hint: "LENDA.Caracteristica.duplaHint", vantagem: ["combo"] },
  flexivel: { label: "LENDA.Caracteristica.flexivel", hint: "LENDA.Caracteristica.flexivelHint", vantagem: ["agarrao"] },
  letal: { label: "LENDA.Caracteristica.letal", hint: "LENDA.Caracteristica.letalHint", splash: 4, splashEfeito: "decisivo" },
  longa: { label: "LENDA.Caracteristica.longa", hint: "LENDA.Caracteristica.longaHint" },
  penetrante: { label: "LENDA.Caracteristica.penetrante", hint: "LENDA.Caracteristica.penetranteHint", penetracao: 1 },
  perigosa: { label: "LENDA.Caracteristica.perigosa", hint: "LENDA.Caracteristica.perigosaHint", vigor: 2 },
  pesada: { label: "LENDA.Caracteristica.pesada", hint: "LENDA.Caracteristica.pesadaHint", dano: 2 },
  precisa: { label: "LENDA.Caracteristica.precisa", hint: "LENDA.Caracteristica.precisaHint", vantagem: ["golpe"] },
  projetil: { label: "LENDA.Caracteristica.projetil", hint: "LENDA.Caracteristica.projetilHint" },
  veloz: { label: "LENDA.Caracteristica.veloz", hint: "LENDA.Caracteristica.velozHint", splash: 4, splashEfeito: "total" },
  vingativa: { label: "LENDA.Caracteristica.vingativa", hint: "LENDA.Caracteristica.vingativaHint", vantagem: ["golpe", "combo", "agarrao", "projetil"] }
};

LENDA.splash = {
  sincronizacao: { label: "LENDA.Splash.sincronizacao", hint: "LENDA.Splash.sincronizacaoHint" },
  decisivo: { label: "LENDA.Splash.decisivo", hint: "LENDA.Splash.decisivoHint" },
  empecilho: { label: "LENDA.Splash.empecilho", hint: "LENDA.Splash.empecilhoHint" },
  total: { label: "LENDA.Splash.total", hint: "LENDA.Splash.totalHint" }
};

LENDA.emocoes = {
  amor: { label: "LENDA.Emocao.amor", hint: "LENDA.Emocao.amorHint", icon: "fa-heart" },
  esperanca: { label: "LENDA.Emocao.esperanca", hint: "LENDA.Emocao.esperancaHint", icon: "fa-sun" },
  confianca: { label: "LENDA.Emocao.confianca", hint: "LENDA.Emocao.confiancaHint", icon: "fa-star" },
  raiva: { label: "LENDA.Emocao.raiva", hint: "LENDA.Emocao.raivaHint", icon: "fa-fire-flame-curved" }
};

/** Pontos de criação de protagonista (cap. 4). */
LENDA.criacao = {
  aura: 1,
  atributos: 18,
  atributoMin: 1,
  atributoMax: 5,
  ocupacoes: 6,
  ocupacaoMax: 3,
  estilo: 6,
  estiloMax: 3,
  trunfos: 2,
  tecnicas: 6,
  lacos: 3,
  ougis: 1
};

/** Custos de avanços (cap. 7). */
LENDA.avancos = [
  { label: "LENDA.Avanco.aumentarOcupacao", custo: 1 },
  { label: "LENDA.Avanco.novaOcupacao", custo: 1 },
  { label: "LENDA.Avanco.trocarTrunfo", custo: 1 },
  { label: "LENDA.Avanco.trocarCaminho", custo: 1 },
  { label: "LENDA.Avanco.redistribuirEstilo", custo: 1 },
  { label: "LENDA.Avanco.novoLaco", custo: 1 },
  { label: "LENDA.Avanco.mestre", custo: 1 },
  { label: "LENDA.Avanco.novaTecnica", custo: 2 },
  { label: "LENDA.Avanco.novoOugi", custo: 2 },
  { label: "LENDA.Avanco.novoEquipamento", custo: 2 },
  { label: "LENDA.Avanco.novoUpgrade", custo: 2 },
  { label: "LENDA.Avanco.aumentarAtributo", custo: 3 },
  { label: "LENDA.Avanco.caixaFerimento", custo: 3 }
];

/** Nomes usados no texto de requisitos que apontam para ocupações. */
LENDA.aliasOcupacao = {
  artista: "artista", atleta: "atleta", atletismo: "atleta", cientista: "cientista", ciencia: "cientista",
  diplomata: "diplomata", engenheiro: "engenheiro", engenharia: "engenheiro", medico: "medico",
  medicina: "medico", mistico: "mistico", piloto: "piloto", trapaceiro: "trapaceiro", vigilante: "vigilante"
};

LENDA.icones = {
  golpe: `systems/${SYSTEM_ID}/assets/icons/golpe.svg`,
  combo: `systems/${SYSTEM_ID}/assets/icons/combo.svg`,
  agarrao: `systems/${SYSTEM_ID}/assets/icons/agarrao.svg`,
  projetil: `systems/${SYSTEM_ID}/assets/icons/projetil.svg`,
  bloqueio: `systems/${SYSTEM_ID}/assets/icons/bloqueio.svg`,
  evasao: `systems/${SYSTEM_ID}/assets/icons/evasao.svg`,
  agua: `systems/${SYSTEM_ID}/assets/icons/agua.svg`,
  ar: `systems/${SYSTEM_ID}/assets/icons/ar.svg`,
  fogo: `systems/${SYSTEM_ID}/assets/icons/fogo.svg`,
  terra: `systems/${SYSTEM_ID}/assets/icons/terra.svg`,
  eter: `systems/${SYSTEM_ID}/assets/icons/eter.svg`,
  variavel: `systems/${SYSTEM_ID}/assets/icons/eter.svg`,
  shintai: `systems/${SYSTEM_ID}/assets/icons/shintai.svg`,
  ritual: `systems/${SYSTEM_ID}/assets/icons/ritual.svg`
};

LENDA.defaultIcons = {
  tecnica: `systems/${SYSTEM_ID}/assets/icons/tecnica.svg`,
  trunfo: `systems/${SYSTEM_ID}/assets/icons/trunfo.svg`,
  caminho: `systems/${SYSTEM_ID}/assets/icons/caminho.svg`,
  estilo: `systems/${SYSTEM_ID}/assets/icons/estilo.svg`,
  equipamento: `systems/${SYSTEM_ID}/assets/icons/equipamento.svg`,
  upgrade: `systems/${SYSTEM_ID}/assets/icons/upgrade.svg`
};
