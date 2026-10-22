# A Lenda do Dragão de Fogo (Karyu Densetsu) — Foundry VTT

Sistema **não oficial** para jogar *A Lenda do Dragão de Fogo: Karyu Densetsu* (Nina Bichara e Thiago Rosa, Jambô Editora) no **Foundry VTT v13 e v14**.

> *A arma mais poderosa da Terra é a alma humana em chamas.*

## Recursos

### Fichas
- **Protagonista** — atributos, ocupações e especializações, estilo de luta, atributos derivados calculados automaticamente (Vigor, Limiares de Canalização, Defesa e Proteção, caixas de ferimento), sincronização, nagen da rodada, caminho com eventos e reviravolta, laços, karma, avanços (a Aura sobe a cada 5), poder das emoções, técnicas, trunfos, equipamentos e biografia.
- **Antagonista** — como a de protagonista, sem caminhos, laços nem karma (regras do capítulo 8).
- **Coadjuvante** — ficha compacta com opção de **grupo** (vantagens automáticas por membro; um membro sai a cada ferimento) e de **coadjuvante instantâneo** (Aura + 2 dados; limiares = dados + Tensão).
- **Espírito** — Aura e Reserva (Aura × 3), que funciona como Vigor e Limiar de Proteção.

### Regras automatizadas
- **Testes**: role d6 igual ao atributo, some ocupação/estilo e escolha os dois dados do total numa janela de seleção. Resultados **1** livres aumentam a **Tensão** e **6+** livres geram **sincronização** (para NPCs, 6+ vira Tensão). Vantagens, desvantagens (com a regra de “menos de 2 dados”), especialização (d6 → d10), conceito, confiança, amor e grupos já entram na conta.
- **Técnicas**: custo em nagen com kiai, arma (+1), afinidade (Tocado/Aceito −1), Ressonância, Ritualista e Aura de Batalha repetida (+5 por ativação). Os dados de sincronização gastos pagam o custo **e** são rolados no ataque. O sistema controla o nagen da rodada contra o Limiar de Canalização, desconta o Vigor excedente (Jasq incluso) e avisa quando o **efeito de Sincronização** é ativado. Dano por fórmula (`@for + @aura + 2`), bônus de ougi e de sincronização, upgrades (Poder, Precisão, Finesse...), Caminho da Perfeição e descarte de dados 5+ (Ranbu, Punho Pulsante).
- **Ataques**: com alvos selecionados, o cartão de chat compara com o Limiar de Defesa, indica acerto, erro, **retaliação** pelo triângulo de ataque e **splash** (com as restrições das armas Letal, Veloz e Debilitante). Botões para aplicar o resultado (Vigor, ferimento, elemento oposto, Aura de Batalha absorvendo ferimento, grupos perdendo membros), aplicar com outro Limiar de Proteção (após um Bloqueio), e escolher o efeito do splash.
- **Defesa total** (Esquiva e Bloqueio), ataques simples, armas com características.
- **Tensão**: painel flutuante, sincronizado entre todos; o narrador ajusta, rola a pilha (com terceiro dado opcional, −1 Tensão), aumenta voluntariamente (karma automático para quem está em cena) e compra vantagens ou sincronização para NPCs.
- **Nova Cena** e **Nova Sessão** com um clique; nagen zerado a cada rodada de combate; **Encerrar Sessão** calcula o karma (eventos + laços + participação + reviravolta).
- Arraste técnicas para a barra de macros.

### Assistente de Criação (passo a passo)
Janela guiada pelos 10 passos do livro (conceito, aura, caminho, laços, 18 pontos de atributo, 6 de ocupação, 6 de estilo, 2 trunfos, 6 técnicas e derivados), com contadores, verificação automática de requisitos e de afinidades, ajustes dos trunfos (Perito, Estilo Secreto, Rede de Contatos, Lobo Solitário, Caminho da Perfeição, Ritualista, Hanyo, Médium, Prodígio) e aplicação direta na ficha.

### Compêndios
| Compêndio | Conteúdo |
|---|---|
| Regras e Passo a Passo | Guia de criação de protagonista e resumo das regras (mecânica central, poder espiritual, ocupações, combate, emoções, karma e avanços, Tensão, coadjuvantes e antagonistas, equipamentos e upgrades, uso do sistema) |
| Caminhos | 20 caminhos com eventos e reviravolta |
| Trunfos | 23 trunfos com modificadores aplicados automaticamente |
| Estilos de Luta | 7 estilos (incluindo os estilos secretos) |
| Técnicas | 115 técnicas, com tipo, afinidade, requisitos, custo, ougi, sincronização e fórmulas de dano |
| Equipamentos e Upgrades | Armas comuns, alta tecnologia, artefatos, implantes e os 9 upgrades |
| Coadjuvantes e Antagonistas | 27 arquétipos prontos do capítulo 10 |

## Instalação

**Pelo manifesto (recomendado):** no Foundry, vá em *Sistemas de Jogo → Instalar Sistema* e cole a URL do manifesto:

```
https://github.com/fernandowrpg/kd-system/releases/latest/download/system.json
```


**Manual:** baixe o `lenda-dragao-fogo.zip` da última release e extraia em `Data/systems/lenda-dragao-fogo`.

## Desenvolvimento

```bash
npm install
npm run lint      # verifica JavaScript, templates, compêndios e traduções
npm run build     # compila packs/_source/* em bancos LevelDB (packs/*)
npm run extract   # o caminho inverso, depois de editar compêndios dentro do Foundry
```

As fontes dos compêndios ficam em `packs/_source/` como JSON (um arquivo por documento), para facilitar o versionamento. Para testar direto de um clone, rode `npm install && npm run build` dentro da pasta `Data/systems/lenda-dragao-fogo`.

### Publicando uma versão
1. Atualize `CHANGELOG.md`.
2. Crie uma release no GitHub com uma tag `vX.Y.Z`.
3. O workflow `Release` compila os compêndios, gera o zip e anexa `system.json` + `lenda-dragao-fogo.zip` à release, com versão e URLs preenchidas automaticamente.

### Estrutura
```
module/        código (documentos, modelos de dados, fichas, dados e testes, assistente)
templates/     templates Handlebars
styles/        CSS
lang/          traduções (pt-BR)
assets/icons/  ícones SVG do sistema
packs/_source/ conteúdo dos compêndios em JSON
tools/         scripts de build, extração e verificação
```

## Créditos e aviso legal

*A Lenda do Dragão de Fogo: Karyu Densetsu* © Nina Bichara, Thiago Rosa e Jambô Editora. Todos os direitos reservados. Este é um projeto de fã, **não oficial**, sem afiliação com a Jambô Editora. Os textos de regras incluídos nos compêndios pertencem aos autores; apoie o jogo comprando o livro em [jamboeditora.com.br](https://jamboeditora.com.br).

O código do sistema (pasta `module/`, `templates/`, `styles/`, `tools/` e ícones) é distribuído sob a licença MIT — veja `LICENSE`.
