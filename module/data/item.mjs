import { LENDA } from "../config.mjs";

const fields = foundry.data.fields;

const int = (initial = 0, min = 0, extra = {}) => new fields.NumberField({ required: true, nullable: false, integer: true, initial, min, ...extra });
const sint = (initial = 0) => new fields.NumberField({ required: true, nullable: false, integer: true, initial });
const str = (initial = "") => new fields.StringField({ required: true, blank: true, initial });
const html = () => new fields.HTMLField({ required: false, blank: true, initial: "" });
const bool = (initial = false) => new fields.BooleanField({ initial });

function modificadoresField() {
  return new fields.SchemaField({
    vigor: sint(), defesa: sint(), protecao: sint(), canalizacao: sint(), ferimentos: sint(), sincInicial: sint()
  });
}

/* -------------------------------------------- */
/*  Técnica                                      */
/* -------------------------------------------- */

export class TecnicaData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      requisitos: str(),
      tipos: new fields.ArrayField(new fields.StringField({ choices: Object.keys(LENDA.estilo) })),
      elemento: new fields.StringField({ required: true, blank: true, initial: "", choices: Object.keys(LENDA.elementos) }),
      acao: new fields.StringField({ required: true, initial: "acao", choices: Object.keys(LENDA.acoes) }),
      nagen: int(0, 0),
      nagenNota: str(),
      custoPorUso: int(0, 0),
      usos: int(0, 0),
      shintai: bool(),
      ritual: bool(),
      descricao: html(),
      ougi: html(),
      sincronizacao: html(),
      ehOugi: bool(),
      perfeicao: bool(),
      ativa: bool(),
      upgrades: new fields.ArrayField(new fields.StringField({ choices: Object.keys(LENDA.upgrades) })),
      limitacao: str(),
      origem: str(),
      ataque: new fields.SchemaField({
        rolar: bool(false),
        atributo: new fields.StringField({ required: true, initial: "agi" }),
        vantagens: sint(),
        vantagensOugi: sint(),
        dano: str(),
        danoOugi: str(),
        danoSinc: str(),
        danoPorDescarte: int(0, 0),
        vigorPorAcerto: int(1, 0)
      })
    };
  }

  /** Primeiro tipo de ataque da técnica (golpe, combo, agarrão ou projétil). */
  get tipoAtaque() {
    return this.tipos.find(t => LENDA.tiposAtaque[t]) ?? null;
  }

  /** Primeiro tipo defensivo (bloqueio ou evasão). */
  get tipoDefesa() {
    return this.tipos.find(t => t === "bloqueio" || t === "evasao") ?? null;
  }

  get ehAtaque() {
    return !!this.tipoAtaque;
  }

  prepareDerivedData() {
    this.custoBase = this.nagen + (this.custoPorUso && this.usos > 0 ? this.custoPorUso * this.usos : 0);
  }
}

/* -------------------------------------------- */
/*  Trunfo                                       */
/* -------------------------------------------- */

export class TrunfoData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      requisitos: str(),
      descricao: html(),
      afinidade: new fields.StringField({ required: true, blank: true, initial: "", choices: Object.keys(LENDA.afinidades) }),
      elemento: new fields.StringField({ required: true, blank: true, initial: "" }),
      escolha: str(),
      jasq: bool(),
      prodigio: bool(),
      modificadores: new fields.SchemaField({
        vigor: sint(), defesa: sint(), protecao: sint(), canalizacao: sint(), ferimentos: sint(), sincInicial: sint(),
        danoArmas: sint(), danoFogo: sint(), vigorPorCena: sint(), tensaoComDois: bool()
      }),
      criacao: new fields.SchemaField({
        lacos: sint(), tecnicas: sint(), estilo: sint(), estiloMax: sint(), ocupacoes: sint(),
        especializacoes: sint(), ougis: sint(), equipamentos: sint(), shintai: sint(), rituais: sint()
      })
    };
  }
}

/* -------------------------------------------- */
/*  Caminho                                      */
/* -------------------------------------------- */

export class CaminhoData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      descricao: html(),
      eventos: new fields.ArrayField(new fields.SchemaField({
        texto: str(),
        marcado: bool()
      }), { initial: [{ texto: "", marcado: false }, { texto: "", marcado: false }, { texto: "", marcado: false }] }),
      reviravolta: new fields.SchemaField({
        texto: str(),
        marcado: bool()
      })
    };
  }

  get marcados() {
    return this.eventos.filter(e => e.marcado).length;
  }
}

/* -------------------------------------------- */
/*  Estilo de Luta                               */
/* -------------------------------------------- */

export class EstiloData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const valores = {};
    for (const k of Object.keys(LENDA.estilo)) valores[k] = int(0, 0, { max: 6 });
    return {
      descricao: html(),
      valores: new fields.SchemaField(valores),
      ougis: new fields.ArrayField(new fields.StringField()),
      secreto: bool()
    };
  }

  get total() {
    return Object.values(this.valores).reduce((a, b) => a + b, 0);
  }
}

/* -------------------------------------------- */
/*  Equipamento                                  */
/* -------------------------------------------- */

export class EquipamentoData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      categoria: new fields.StringField({ required: true, initial: "arma", choices: Object.keys(LENDA.categoriasEquipamento) }),
      caracteristicas: new fields.ArrayField(new fields.StringField({ choices: Object.keys(LENDA.caracteristicas) })),
      descricao: html(),
      equipado: bool(true),
      quantidade: int(1, 0),
      modificadores: modificadoresField()
    };
  }

  get ehArma() {
    return this.categoria === "arma" || (this.categoria === "artefato" && this.caracteristicas.length > 0)
      || (this.categoria === "implante" && this.caracteristicas.length > 0);
  }
}

/* -------------------------------------------- */
/*  Upgrade (referência de compêndio)            */
/* -------------------------------------------- */

export class UpgradeData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      chave: new fields.StringField({ required: true, initial: "poder", choices: Object.keys(LENDA.upgrades) }),
      descricao: html()
    };
  }
}
