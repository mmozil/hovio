# -*- coding: utf-8 -*-
"""
Bling API v3 — ferramental da La Belle Scens.

NÃO guarda segredo: client_id/secret vêm de variáveis de ambiente ou do arquivo
`arquivos/bling/.env.bling` (pasta fora do git). O token fica em
`arquivos/bling/token.json`, também fora do git.

Uso:
    python scripts/bling_labelle.py autorizar          # imprime a URL de autorização
    python scripts/bling_labelle.py token <code>       # troca o code por token (⏱ ~60 s de validade)
    python scripts/bling_labelle.py teste              # confere se o token está vivo
    python scripts/bling_labelle.py inventario         # varre a conta e escreve o relatório
    python scripts/bling_labelle.py get <caminho>      # chamada avulsa, ex.: get produtos?limite=5

Fatos da API (validados na integração Bling que a Tier já roda em produção):
  · dados      → https://api.bling.com.br/Api/v3   (o www foi bloqueado para dados em jul/2026)
  · oauth      → https://www.bling.com.br/Api/v3/oauth/token   (continua no www)
  · auth       → Basic base64(client_id:client_secret) + header `Accept: 1.0`
  · access_token 6 h · refresh_token 30 dias · authorization code ~60 s
  · rate limit 3 req/s  → este script respeita 0,4 s entre chamadas
"""
from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

# console do Windows (cp1252) quebra em acento/símbolo — força UTF-8 na saída
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

RAIZ = Path(__file__).resolve().parent.parent
DIR = RAIZ / "arquivos" / "bling"
TOKEN_FILE = DIR / "token.json"
ENV_FILE = DIR / ".env.bling"

API = "https://api.bling.com.br/Api/v3"
OAUTH_AUTHORIZE = "https://www.bling.com.br/Api/v3/oauth/authorize"
OAUTH_TOKEN = "https://www.bling.com.br/Api/v3/oauth/token"
PAUSA = 0.4  # 3 req/s


# ── credenciais ─────────────────────────────────────────────────────────────
def creds() -> tuple[str, str]:
    cid = os.environ.get("BLING_LABELLE_CLIENT_ID")
    sec = os.environ.get("BLING_LABELLE_CLIENT_SECRET")
    if not (cid and sec) and ENV_FILE.exists():
        for linha in ENV_FILE.read_text(encoding="utf-8").splitlines():
            if "=" in linha and not linha.strip().startswith("#"):
                k, v = linha.split("=", 1)
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k == "BLING_LABELLE_CLIENT_ID":
                    cid = cid or v
                elif k == "BLING_LABELLE_CLIENT_SECRET":
                    sec = sec or v
    if not (cid and sec):
        sys.exit("Faltam credenciais: defina BLING_LABELLE_CLIENT_ID/SECRET ou crie %s" % ENV_FILE)
    return cid, sec


def _post_form(url: str, dados: dict) -> dict:
    cid, sec = creds()
    auth = base64.b64encode(f"{cid}:{sec}".encode()).decode()
    req = urllib.request.Request(
        url,
        data=urllib.parse.urlencode(dados).encode(),
        headers={
            "Authorization": f"Basic {auth}",
            "Accept": "1.0",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        corpo = e.read().decode(errors="replace")
        sys.exit(f"Bling respondeu {e.code}: {corpo[:400]}")


def salvar_token(payload: dict) -> None:
    DIR.mkdir(parents=True, exist_ok=True)
    dados = {
        "access_token": payload["access_token"],
        "refresh_token": payload.get("refresh_token"),
        "expira_em": int(time.time()) + int(payload.get("expires_in") or 21600),
        "obtido_em": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    TOKEN_FILE.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Token salvo em {TOKEN_FILE} · expira em {int(payload.get('expires_in') or 21600) // 3600} h")


def token_valido() -> str:
    if not TOKEN_FILE.exists():
        sys.exit("Sem token. Rode: python scripts/bling_labelle.py autorizar")
    d = json.loads(TOKEN_FILE.read_text(encoding="utf-8"))
    if d["expira_em"] - int(time.time()) > 300:
        return d["access_token"]
    if not d.get("refresh_token"):
        sys.exit("Token vencido e sem refresh_token — refazer a autorização.")
    print("Token perto do fim; renovando…")
    novo = _post_form(OAUTH_TOKEN, {"grant_type": "refresh_token", "refresh_token": d["refresh_token"]})
    if not novo.get("refresh_token"):
        novo["refresh_token"] = d["refresh_token"]
    salvar_token(novo)
    return novo["access_token"]


# ── chamadas ────────────────────────────────────────────────────────────────
def get(caminho: str, token: str | None = None) -> dict | None:
    token = token or token_valido()
    req = urllib.request.Request(
        f"{API}/{caminho.lstrip('/')}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    time.sleep(PAUSA)
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        corpo = e.read().decode(errors="replace")[:200]
        print(f"  ! {caminho} → {e.code} {corpo}")
        return None


# ── comandos ────────────────────────────────────────────────────────────────
def cmd_autorizar() -> None:
    cid, _ = creds()
    estado = base64.urlsafe_b64encode(os.urandom(12)).decode().rstrip("=")
    url = f"{OAUTH_AUTHORIZE}?response_type=code&client_id={cid}&state={estado}"
    print("1) Abra no navegador, logado na conta Bling DA LA BELLE:\n")
    print("   " + url + "\n")
    print("2) Autorize. O Bling volta para a URL de redirecionamento cadastrada no app, com ?code=…")
    print("3) ⏱ O code vale ~60 segundos. Copie e rode em seguida:\n")
    print("   python scripts/bling_labelle.py token <code>\n")


def cmd_token(code: str) -> None:
    salvar_token(_post_form(OAUTH_TOKEN, {"grant_type": "authorization_code", "code": code}))


def cmd_teste() -> None:
    t = token_valido()
    for caminho in ("empresas/me/dados-basicos", "produtos?limite=1", "depositos?limite=1"):
        r = get(caminho, t)
        print(f"{caminho:34s} → {'ok' if r is not None else 'falhou'}")
        if r and caminho.startswith("empresas"):
            d = r.get("data") or {}
            print("   empresa:", d.get("nome") or d.get("razaoSocial") or d, "· CNPJ:", d.get("cnpj") or d.get("numeroDocumento"))


def _conta(caminho: str, token: str, paginas_max: int = 40) -> tuple[int, list]:
    """Conta itens paginando (limite 100/página) e devolve amostra dos 3 primeiros."""
    total, amostra, pagina = 0, [], 1
    while pagina <= paginas_max:
        sep = "&" if "?" in caminho else "?"
        r = get(f"{caminho}{sep}pagina={pagina}&limite=100", token)
        itens = (r or {}).get("data") or []
        if not itens:
            break
        if pagina == 1:
            amostra = itens[:3]
        total += len(itens)
        if len(itens) < 100:
            break
        pagina += 1
    return total, amostra


def cmd_inventario() -> None:
    t = token_valido()
    print("Varrendo a conta Bling da La Belle…\n")
    linhas = ["# Inventário da conta Bling — La Belle Scens", "",
              "Gerado por `scripts/bling_labelle.py inventario` em " + time.strftime("%d/%m/%Y %H:%M"), ""]

    emp = get("empresas/me/dados-basicos", t)
    if emp:
        d = emp.get("data") or {}
        linhas += ["## Empresa", "",
                   f"- **{d.get('nome') or d.get('razaoSocial') or '—'}** · CNPJ {d.get('cnpj') or d.get('numeroDocumento') or '—'}",
                   f"- e-mail: {d.get('email') or '—'} · telefone: {d.get('telefone') or '—'}", ""]

    modulos = [
        ("Produtos", "produtos"),
        ("Depósitos", "depositos"),
        ("Categorias de produto", "categorias/produtos"),
        ("Contatos (clientes/fornecedores)", "contatos"),
        ("Pedidos de venda", "pedidos/vendas"),
        ("Pedidos de compra", "pedidos/compras"),
        ("Notas fiscais", "nfe"),
        ("Contas a receber", "contas/receber"),
        ("Contas a pagar", "contas/pagar"),
        ("Formas de pagamento", "formas-pagamentos"),
        ("Contratos", "contratos"),
        ("Ordens de produção", "ordens-producao"),
    ]
    linhas += ["## O que existe na conta", "", "| Módulo | Endpoint | Registros |", "|---|---|---:|"]
    detalhes = []
    for nome, ep in modulos:
        total, amostra = _conta(ep, t)
        print(f"  {nome:36s} {total}")
        linhas.append(f"| {nome} | `/{ep}` | {total} |")
        if amostra:
            detalhes.append((nome, ep, amostra))
    linhas.append("")

    for nome, ep, amostra in detalhes:
        linhas += [f"### {nome} — campos disponíveis", "",
                   "```json", json.dumps(amostra[0], ensure_ascii=False, indent=2)[:1800], "```", ""]

    saida = DIR / "inventario-bling.md"
    DIR.mkdir(parents=True, exist_ok=True)
    saida.write_text("\n".join(linhas), encoding="utf-8")
    print(f"\nRelatório: {saida}")


def cmd_get(caminho: str) -> None:
    r = get(caminho)
    print(json.dumps(r, ensure_ascii=False, indent=2)[:4000] if r else "sem resposta")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd = sys.argv[1]
    if cmd == "autorizar":
        cmd_autorizar()
    elif cmd == "token":
        if len(sys.argv) < 3:
            sys.exit("uso: token <code>")
        cmd_token(sys.argv[2])
    elif cmd == "teste":
        cmd_teste()
    elif cmd == "inventario":
        cmd_inventario()
    elif cmd == "get":
        if len(sys.argv) < 3:
            sys.exit("uso: get <caminho>   ex.: get produtos?limite=5")
        cmd_get(sys.argv[2])
    else:
        sys.exit(__doc__)
