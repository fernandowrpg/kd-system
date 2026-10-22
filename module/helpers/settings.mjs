import { SYSTEM_ID } from "../config.mjs";
import { renderizarPainelTensao } from "./tensao.mjs";

export function registrarConfiguracoes() {
  game.settings.register(SYSTEM_ID, "tensao", {
    name: "LENDA.Config.Tensao",
    scope: "world",
    config: false,
    type: Number,
    default: 2,
    onChange: () => {
      renderizarPainelTensao();
      // Coadjuvantes instantâneos usam a Tensão nos limiares.
      for (const app of foundry.applications.instances.values()) {
        if (app.document?.type === "coadjuvante" && app.document.system?.instantaneo?.ativo && app.rendered) {
          app.document.reset();
          app.render();
        }
      }
    }
  });

  game.settings.register(SYSTEM_ID, "selecaoManual", {
    name: "LENDA.Config.SelecaoManual",
    hint: "LENDA.Config.SelecaoManualHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(SYSTEM_ID, "mostrarPainel", {
    name: "LENDA.Config.MostrarPainel",
    hint: "LENDA.Config.MostrarPainelHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => renderizarPainelTensao()
  });

  game.settings.register(SYSTEM_ID, "tensaoPublica", {
    name: "LENDA.Config.TensaoPublica",
    hint: "LENDA.Config.TensaoPublicaHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => renderizarPainelTensao()
  });

  game.settings.register(SYSTEM_ID, "mensagensTensao", {
    name: "LENDA.Config.MensagensTensao",
    hint: "LENDA.Config.MensagensTensaoHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(SYSTEM_ID, "mensagensTensaoDados", {
    name: "LENDA.Config.MensagensTensaoDados",
    hint: "LENDA.Config.MensagensTensaoDadosHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(SYSTEM_ID, "zerarNagenRodada", {
    name: "LENDA.Config.ZerarNagen",
    hint: "LENDA.Config.ZerarNagenHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
}
