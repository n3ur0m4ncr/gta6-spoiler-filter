# Escudo Anti-Spoiler GTA 6 (Brave / Chromium)

Filtro rigoroso e 100% local para bloquear possíveis spoilers de **GTA 6 / GTA VI** no navegador **Brave** (e navegadores baseados em Chromium), composto por uma **extensão Manifest V3** e uma **lista de filtros nativos para o Brave Shields**.

---

## Recursos

- **Cobertura ampla de sites:** YouTube (vídeos, Shorts, previews e comentários), X/Twitter, Reddit (inclusive comentários aninhados), Brave Search, Google Busca/Notícias, Twitch, TikTok, Facebook, Instagram, Discord Web, Telegram Web, WhatsApp Web e portais de notícias em geral.
- **Modo rigoroso ativado por padrão:**
  - Bloqueia `GTA 6`, `GTA VI`, `Grand Theft Auto 6/VI`, `Leonida`, `novo/próximo GTA` e ofuscações (`G.T.A 6`, `GTA ⑥`, `GTA 6️⃣`, caracteres invisíveis).
  - Opção **Proteção máxima** (`strictMode`): bloqueia também menções isoladas a `Rockstar`, `Take-Two` e `Vice City`.
  - Opção **Bloquear qualquer "GTA"** (`blockAnyGta`): filtra menções a `GTA` mesmo sem o número `6` / `VI`.
- **Detecção além do texto visível:** inspeciona URLs de links, `img[src]`, `alt`, `aria-label`, `title`, `iframe` incorporados e tags `<meta>` em páginas de artigos.
- **Escudo de página inteira + proteção de áudio:** cobre a tela sem vazar o título caso você abra uma página/vídeo sobre GTA 6 por engano e pausa/muta qualquer `<video>` ou `<audio>` automaticamente.
- **Sem flash visual e sem telemetria:** roda a partir de `document_start` usando apenas a permissão `storage`, sem chamadas de rede externas.

---

## Como instalar no Brave

### Opção 1: Extensão (Recomendada)

1. Baixe este repositório (`Code -> Download ZIP` e extraia, ou execute `git clone https://github.com/n3ur0m4ncr/gta6-spoiler-filter.git`).
2. No Brave, abra: `brave://extensions`
3. Ative o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** (*Load unpacked*) e selecione a pasta do repositório.
5. Fixe o ícone do **Escudo GTA 6** na barra do navegador para alternar entre **Ocultar totalmente** ou **Borrar com aviso**, adicionar palavras extras ou pausar em algum site específico.

### Opção 2: Lista nativa no Brave Shields (Opcional / Camada extra)

Você pode assinar a lista diretamente pela URL ou colar as regras manualmente em `brave://settings/shields/filters`:

- **Assinar lista por URL** (*Adicionar lista de filtros*):
  ```text
  https://raw.githubusercontent.com/n3ur0m4ncr/gta6-spoiler-filter/main/brave-shields-filters.txt
  ```
- **Ou colar manualmente**: copie o conteúdo de [`brave-shields-filters.txt`](brave-shields-filters.txt) em **Criar filtros personalizados** e salve.

---

## Estrutura do projeto

```text
gta6-spoiler-filter/
├── .github/workflows/test.yml   # CI com Node.js test runner
├── icons/                       # Ícones PNG da extensão (16, 48, 128)
├── src/
│   ├── matcher.js               # Motor de normalização e detecção de padrões
│   ├── content.js               # Scanner DOM, escudo de página e trava de mídia
│   ├── content.css              # Estilos de ocultação, desfoque e escudo
│   ├── popup.html               # Interface do popup da extensão
│   ├── popup.css                # Tema escuro do popup
│   └── popup.js                 # Lógica de configurações e estatísticas
├── tests/
│   ├── matcher.test.js          # Testes unitários do matcher
│   └── content.test.js          # Testes de DOM e comportamento por site
├── brave-shields-filters.txt    # Regras nativas para adblock-rust / uBO
├── manifest.json                # Manifesto da extensão (MV3)
└── package.json
```

---

## Testes

Requer Node.js >= 20 (sem dependências externas):

```bash
npm run check
npm test
```

## Licença

[MIT](LICENSE)
