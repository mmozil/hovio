# Extensão do Discoo — spike de captura

Grava o áudio da **aba** da reunião sem o diálogo "escolha o que compartilhar".
É a peça que o site não consegue oferecer e que hoje só o app do Windows dá.

## Rodar

1. `chrome://extensions` → ligar **Modo do desenvolvedor**
2. **Carregar sem compactação** → escolher esta pasta
3. Abrir a reunião (Meet), clicar no ícone do Discoo → **Gravar esta reunião**

Atalho: `Ctrl+Shift+Y` grava e para sem abrir o popup.

## O que já está provado (medido, não estimado)

`node teste/pipeline.js` sobe o Chromium com a extensão, um microfone falso com
som e mede o caminho inteiro depois da captura:

```
pipeline: 6 pedaços · 48.841 bytes no OPFS · aba com som (17) · mic com som (19)
gravado:  6,00 s · RMS 0,3356 · pico 0,678      ← decodificado, não é silêncio
```

- **as duas fontes entram misturadas** (aba + microfone);
- **cada pedaço vai pro disco durante a gravação** (OPFS, abrindo e fechando o
  writable a cada escrita — só o `close()` materializa o arquivo);
- o `.webm` que sai **decodifica e tem áudio**.

## O que o spike descobriu, e muda o desenho

🚨 **`getMediaStreamId` recusa a captura sem invocação do usuário na aba:**

```
Extension has not been invoked for the current page (see activeTab permission)
```

`host_permissions` **não** substitui isso. As duas formas de conceder são clique
no ícone e atalho de comando — então **gravar sempre começa por um gesto**. Não é
um problema: é um clique, sem diálogo e sem toggle, contra o clique + diálogo +
"Compartilhar áudio da guia" do site.

Como consequência, não existe "gravar sozinho quando a reunião começa" — o
máximo é avisar na página que a reunião começou e deixar o gesto a um clique.

## O que falta

- ⬜ Pílula dentro da página do Meet (o `pilula.js` hoje só acorda o service
  worker e publica o id da extensão no DOM).
- ⬜ Permissão do microfone: precisa ser concedida numa página **visível** da
  extensão antes do primeiro uso — o offscreen não tem gesto pra pedir.
- ⬜ Mandar o áudio pro `/api/discoo/transcrever` e mostrar a ata (o backend já
  está no ar, é o mesmo do site).
- ⬜ Publicar na Chrome Web Store (US$ 5, uma vez) com política de privacidade.

⚠️ O teste automatizado **não** cobre o gesto de invocação: teclado do sistema
não alcança a janela controlada por automação (medido em `teste/pipeline.js`,
item A). Essa parte se confere na mão, em 30 segundos, pelos passos acima.
