import { LENDA } from "../config.mjs";

const fields = foundry.data.fields;

/* -------------------------------------------- */
/*  Campos reutilizáveis                         */
/* -------------------------------------------- */

const int = (initial = 0, min = 0, extra = {}) => new fields.NumberField({ required: true, nullable: false, integer: true, initial, min, ...extra });
const bonus = () => new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 });
const html = () => new fields.HTMLField({ required: false, blank: true, initial: "" });

function atributosField(initial = 1) {
  const schema = {};
  for (const key of Object.keys(LENDA.atributos)) schema[key] = int(initial, 0, { max: 10 });
  return new fields.SchemaField(schema);
}

function ocupacoesField() {
  const schema = {};
  for (const key of Object.keys(LENDA.ocupacoes)) {
    schema[key] = new fields.SchemaField({
      value: int(0, 0, { max: 5 }),
      especializacoes: new fields.StringField({ required: true, blank: true, initial: "" })
    });
  }
  return new fields.SchemaField(schema);
}

function estiloField() {
  const schema = { nome: new fields.StringField({ required: true, blank: true, initial: "" }) };
  for (const key of Object.keys(LENDA.estilo)) schema[key] = int(0, 0, { max: 6 });
  return new fields.SchemaField(schema);
}

/**
 * Efeitos automáticos de técnicas sustentadas enquanto estão marcadas como ativas.
 * Recebe (sistema do ator, técnica) e devolve bônus de limiares.
 */
const EFEITOS_ATIVOS = {
  "aura de batalha": (s, t) => ({ protecao: s.aura + (t.system.ehOugi ? 1 : 0) }),
  "ginga de batalha": () => ({ defesa: 1 }),
  "defesa circular": s => ({ defesa: s.aura, protecao: s.aura }),
  "manto da montanha": s => ({ protecao: s.atributos?.vontade ?? 0 }),
  "aura eterea": () => ({ defesa: 2 })
};

/**
 * Soma os modificadores de trunfos e equipamentos equipados do ator.
 * @param {Actor} actor
 */
export function coletarModificadores(actor) {
  const mods = { vigor: 0, defesa: 0, protecao: 0, canalizacao: 0, ferimentos: 0, sincInicial: 0,
    danoArmas: 0, danoFogo: 0, vigorPorCena: 0, tensaoComDois: false, jasq: false, afinidades: [] };
  if (!actor?.items) return mods;
  let implantes = 0;
  for (const item of actor.items) {
    const m = item.system?.modificadores;
    if (item.type === "trunfo") {
      if (m) for (const [k, v] of Object.entries(m)) {
        if (typeof v === "number") mods[k] = (mods[k] ?? 0) + v;
        else if (v === true) mods[k] = true;
      }
      if (item.system.jasq) mods.jasq = true;
      if (item.system.afinidade && item.system.elemento) {
        mods.afinidades.push({ tipo: item.system.afinidade, elemento: item.system.elemento, nome: item.name });
      }
    } else if (item.type === "equipamento") {
      if (item.system.categoria === "implante") implantes++;
      if (!item.system.equipado || !m) continue;
      for (const k of ["vigor", "defesa", "protecao", "canalizacao", "ferimentos", "sincInicial"]) mods[k] += m[k] ?? 0;
    }
  }
  // Cada implante depois do primeiro diminui o Limiar de Canalização em 1.
  if (implantes > 1) mods.canalizacao -= implantes - 1;
  mods.implantes = implantes;
  mods.ativas = [];
  for (const item of actor.items) {
    if (item.type !== "tecnica" || !item.system.ativa) continue;
    const chave = (item.system.origem || item.name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const efeito = EFEITOS_ATIVOS[chave];
    if (!efeito) continue;
    const bonus = efeito(actor.system, item);
    for (const [k, v] of Object.entries(bonus)) mods[k] += v;
    mods.ativas.push(item.name);
  }
  return mods;
}

/* -------------------------------------------- */
/*  Modelo base de personagem                    */
/* -------------------------------------------- */

export class PersonagemData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      aura: int(1, 0, { max: 10 }),
      conceito: new fields.StringField({ required: true, blank: true, initial: "" }),
      atributos: atributosField(1),
      ocupacoes: ocupacoesField(),
      estilo: estiloField(),
      vigor: new fields.SchemaField({
        value: int(0, -99),
        bonus: bonus()
      }),
      ferimentos: new fields.SchemaField({
        value: int(0, 0),
        bonus: bonus()
      }),
      limiares: new fields.SchemaField({
        canalizacao: new fields.SchemaField({ bonus: bonus() }),
        defesa: new fields.SchemaField({ bonus: bonus() }),
        protecao: new fields.SchemaField({ bonus: bonus() })
      }),
      sincronizacao: new fields.SchemaField({ value: int(0, 0) }),
      nagen: new fields.SchemaField({ rodada: int(0, 0) }),
      emocoes: new fields.SchemaField({
        amor: new fields.BooleanField({ initial: false }),
        esperanca: int(0, 0),
        confianca: new fields.BooleanField({ initial: false }),
        raiva: new fields.BooleanField({ initial: false })
      }),
      biografia: html(),
      notas: html(),
      especial: html()
    };
  }

  /** O tipo de personagem joga como protagonista (gera sincronização e tensão com 1s)? */
  get ehProtagonista() {
    return false;
  }

  prepareDerivedData() {
    const mods = coletarModificadores(this.parent);
    this.modificadores = mods;
    const a = this.atributos;
    const e = this.estilo;
    const aura = this.aura;

    this.vigor.max = Math.max(0, aura + a.vontade + a.forca + mods.vigor + this.vigor.bonus);
    this.limiares.canalizacao.value = aura + 2 + mods.canalizacao + this.limiares.canalizacao.bonus;
    this.limiares.defesa.value = aura + a.agilidade + Math.max(a.razao, a.instinto) + e.evasao + mods.defesa + this.limiares.defesa.bonus;
    this.limiares.protecao.value = aura + a.forca + e.bloqueio + mods.protecao + this.limiares.protecao.bonus;
    this.ferimentos.max = Math.max(0, 1 + mods.ferimentos + this.ferimentos.bonus);
    this.sincronizacao.inicial = Math.max(0, aura + mods.sincInicial);
    this.acoesExtras = aura;

    this.ferido = this.ferimentos.value > 0;
    this.derrotado = this.ferimentos.value > this.ferimentos.max;
    this.nagen.limite = this.limiares.canalizacao.value;
    this.nagen.excesso = Math.max(0, this.nagen.rodada - this.limiares.canalizacao.value);
  }

  /** Dados que o personagem rola para um atributo. */
  dadosAtributo(chave) {
    return this.atributos[chave] ?? 0;
  }
}

/* -------------------------------------------- */
/*  Protagonista                                 */
/* -------------------------------------------- */

export class ProtagonistaData extends PersonagemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      lacos: new fields.ArrayField(new fields.SchemaField({
        nome: new fields.StringField({ required: true, blank: true, initial: "" }),
        marcado: new fields.BooleanField({ initial: false })
      }), { initial: [{ nome: "", marcado: false }, { nome: "", marcado: false }, { nome: "", marcado: false }] }),
      karma: new fields.SchemaField({
        value: int(0, 0),
        total: int(0, 0)
      }),
      avancos: new fields.SchemaField({ value: int(0, 0) }),
      conceitoUsado: new fields.BooleanField({ initial: false }),
      limitacoes: new fields.StringField({ required: true, blank: true, initial: "" }),
      detalhes: new fields.SchemaField({
        idade: new fields.StringField({ required: true, blank: true, initial: "" }),
        origem: new fields.StringField({ required: true, blank: true, initial: "" }),
        jogador: new fields.StringField({ required: true, blank: true, initial: "" })
      })
    };
  }

  get ehProtagonista() {
    return true;
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    this.avancos.paraAura = 5 - (this.avancos.value % 5);
  }
}

/* -------------------------------------------- */
/*  Antagonista                                  */
/* -------------------------------------------- */

export class AntagonistaData extends PersonagemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      avancos: new fields.SchemaField({ value: int(0, 0) })
    };
  }
}

/* -------------------------------------------- */
/*  Coadjuvante                                  */
/* -------------------------------------------- */

export class CoadjuvanteData extends PersonagemData {
  static defineSchema() {
    const schema = super.defineSchema();
    schema.aura = int(0, 0, { max: 10 });
    return {
      ...schema,
      grupo: new fields.SchemaField({
        ativo: new fields.BooleanField({ initial: false }),
        tamanho: int(1, 1)
      }),
      instantaneo: new fields.SchemaField({
        ativo: new fields.BooleanField({ initial: false }),
        fazBem: new fields.StringField({ required: true, blank: true, initial: "" }),
        fazMal: new fields.StringField({ required: true, blank: true, initial: "" })
      })
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    // Grupos ganham uma vantagem por membro além do primeiro (máximo 5).
    this.grupo.vantagens = this.grupo.ativo ? Math.min(5, Math.max(0, this.grupo.tamanho - 1)) : 0;
    if (this.instantaneo.ativo) {
      const dados = this.aura + 2;
      let tensao = 2;
      try { tensao = game.settings.get("lenda-dragao-fogo", "tensao"); } catch(err) { /* ainda não registrado */ }
      this.instantaneo.dados = dados;
      this.limiares.defesa.value = dados + tensao;
      this.limiares.protecao.value = dados + tensao;
      this.limiares.canalizacao.value = this.aura + 2;
      this.vigor.max = Math.max(1, dados + this.vigor.bonus);
    }
  }

  dadosAtributo(chave) {
    if (this.instantaneo.ativo) return this.aura + 2;
    return super.dadosAtributo(chave);
  }
}

/* -------------------------------------------- */
/*  Espírito                                     */
/* -------------------------------------------- */

export class EspiritoData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      aura: int(1, 0, { max: 10 }),
      reserva: new fields.SchemaField({
        value: int(3, -99),
        bonus: bonus()
      }),
      afinidade: new fields.StringField({ required: true, blank: true, initial: "" }),
      polaridade: new fields.StringField({ required: true, blank: true, initial: "" }),
      biografia: html(),
      notas: html()
    };
  }

  get ehProtagonista() {
    return false;
  }

  prepareDerivedData() {
    this.reserva.max = Math.max(0, this.aura * 3 + this.reserva.bonus);
    this.dados = this.aura + 2;
    // A reserva funciona como Barra de Vigor e Limiar de Proteção.
    this.vigor = { value: this.reserva.value, max: this.reserva.max };
    this.limiares = {
      defesa: { value: this.dados },
      protecao: { value: this.reserva.value },
      canalizacao: { value: 0 }
    };
    this.modificadores = coletarModificadores(this.parent);
  }

  dadosAtributo() {
    return this.aura + 2;
  }
}
