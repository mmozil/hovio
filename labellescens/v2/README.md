# Maison Élan — Luxury Beauty Editorial

Landing page original inspirada na linguagem editorial de sites premium de beleza e perfumaria. O projeto não utiliza marca, textos, imagens ou código da Dior.

## Como abrir

### Opção simples
Abra `index.html` diretamente no navegador.

### Opção recomendada
Use um servidor local para evitar limitações do navegador:

```bash
python -m http.server 8080
```

Depois, acesse `http://localhost:8080`.

## Arquivos

- `index.html` — estrutura semântica completa
- `styles.css` — layout, responsividade, tipografia e animações
- `script.js` — preloader, menu, parallax, header, story sticky, carrossel e formulário
- `assets/` — artes SVG originais criadas para o conceito

## Recursos implementados

- Hero cinematográfico
- Barra de anúncios rotativa
- Header transparente com mudança automática de tema
- Header que desaparece ao rolar para baixo e retorna ao subir
- Mega menu acessível com focus trap e tecla Escape
- Parallax suave sem bibliotecas externas
- Reveals de texto por máscara e entrada vertical
- Seção narrativa sticky com troca de cenas
- Grid editorial assimétrico
- Seção escura de produto
- Carrossel responsivo de serviços
- Newsletter com validação
- Footer responsivo em accordion
- Suporte a `prefers-reduced-motion`
- Layout adaptado para desktop, tablet e mobile

## Personalização rápida

Cores e espaçamentos ficam no início de `styles.css`, dentro de `:root`.

Principais tokens:

```css
--ink
--paper
--paper-2
--pad-x
--section-y
--serif
--sans
```

Para trocar imagens, substitua os arquivos em `assets/` mantendo os nomes ou altere os caminhos no HTML.

## Observação

As fontes são carregadas pelo Google Fonts. Sem internet, o layout usa Georgia e Arial como fallback.
