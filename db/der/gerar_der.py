#!/usr/bin/env python3
"""Gera o DER (diagrama entidade-relacionamento) a partir do banco já migrado.

O diagrama é lido do próprio MySQL (information_schema), então sempre reflete
as migrações aplicadas. Requer o cliente `mysql` e o Graphviz (`dot`).

Uso:
    DB_NAME=traycheck python3 db/der/gerar_der.py
Saída: db/der/DER_TrayCheck.dot, .png e .svg
"""
import os
import subprocess
from collections import defaultdict
from pathlib import Path

DB = os.environ.get("DB_NAME", "traycheck")
USER = os.environ.get("DB_USER", "root")
SAIDA = Path(__file__).resolve().parent / "DER_TrayCheck"

# Agrupamento por módulo (CIs do Documento de Requisitos)
GRUPOS = {
    "Autenticação e perfis (CI-05)": ["perfil", "usuario"],
    "Cadastro (CI-01)": ["procedimento", "instrumental", "kit", "kit_instrumental",
                         "checklist_padrao", "item_checklist"],
    "Checagem (CI-02)": ["checagem", "item_checagem"],
    "Relatórios e auditoria (CI-04)": ["divergencia", "relatorio_conferencia"],
    "Estoque": ["estoque_item", "estoque_movimentacao"],
}
CORES = ["#DBEAFE", "#D1FAE5", "#FEF3C7", "#FEE2E2", "#EDE9FE"]


def consulta(sql: str) -> list[list[str]]:
    r = subprocess.run(
        ["mysql", f"--user={USER}", "--default-character-set=utf8mb4", "-N", "-B", DB, "-e", sql],
        check=True, capture_output=True, text=True,
    )
    return [linha.split("\t") for linha in r.stdout.splitlines() if linha]


colunas = defaultdict(list)
for tabela, coluna, tipo, chave, nulo, extra in consulta(
    f"""SELECT table_name, column_name, column_type, column_key, is_nullable, extra
        FROM information_schema.columns
        WHERE table_schema = '{DB}' AND table_name <> 'schema_versao'
        ORDER BY table_name, ordinal_position"""
):
    colunas[tabela].append((coluna, tipo, chave, nulo, extra))

fks = consulta(
    f"""SELECT table_name, column_name, referenced_table_name
        FROM information_schema.key_column_usage
        WHERE table_schema = '{DB}' AND referenced_table_name IS NOT NULL"""
)
colunas_fk = {(t, c) for t, c, _ in fks}
unicas = {(t, c) for t, c in consulta(
    f"""SELECT s.table_name, s.column_name FROM information_schema.statistics s
        WHERE s.table_schema = '{DB}' AND s.non_unique = 0 AND s.index_name <> 'PRIMARY'
          AND (SELECT COUNT(*) FROM information_schema.statistics s2
               WHERE s2.table_schema = s.table_schema AND s2.table_name = s.table_name
                 AND s2.index_name = s.index_name) = 1"""
)}


def tabela_html(nome: str, cor: str) -> str:
    linhas = [f'<TR><TD BGCOLOR="#1E3A8A" COLSPAN="3"><FONT COLOR="white"><B>{nome}</B></FONT></TD></TR>']
    for coluna, tipo, chave, nulo, extra in colunas[nome]:
        marcas = []
        if chave == "PRI":
            marcas.append("PK")
        if (nome, coluna) in colunas_fk:
            marcas.append("FK")
        if (nome, coluna) in unicas:
            marcas.append("UQ")
        if extra.upper() in ("STORED GENERATED", "VIRTUAL GENERATED"):
            marcas.append("calc")
        tipo_txt = tipo.replace(" unsigned", "").replace("tinyint(1)", "boolean")
        nome_txt = f"<B>{coluna}</B>" if chave == "PRI" else coluna
        if nulo == "YES":
            tipo_txt += "?"
        linhas.append(
            f'<TR><TD ALIGN="LEFT" BGCOLOR="{cor}">{" ".join(marcas)}</TD>'
            f'<TD ALIGN="LEFT" PORT="{coluna}">{nome_txt}</TD>'
            f'<TD ALIGN="LEFT"><FONT COLOR="#6B7280">{tipo_txt}</FONT></TD></TR>'
        )
    return f'<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="4">{"".join(linhas)}</TABLE>>'


dot = [
    "digraph DER {",
    '  graph [rankdir=LR, fontname="Helvetica", fontsize=12, nodesep=0.5, ranksep=1.0, pad=0.4,'
    ' label="TrayCheck — Modelo de Dados (MySQL 8) — gerado a partir de db/migrations\\nLinhas pontilhadas cinza: autoria (usuário que criou/registrou o dado)", labelloc=t];',
    '  node [shape=plaintext, fontname="Helvetica", fontsize=10];',
    '  edge [fontname="Helvetica", fontsize=9, color="#475569", arrowhead=crow, arrowtail=tee, dir=both];',
]
for i, (grupo, tabelas) in enumerate(GRUPOS.items()):
    cor = CORES[i % len(CORES)]
    dot.append(f'  subgraph cluster_{i} {{ label="{grupo}"; style="rounded,dashed"; color="#94A3B8";')
    for t in tabelas:
        if t in colunas:
            dot.append(f"    {t} [label={tabela_html(t, cor)}];")
    dot.append("  }")
faltantes = set(colunas) - {t for ts in GRUPOS.values() for t in ts}
for t in sorted(faltantes):
    dot.append(f"  {t} [label={tabela_html(t, '#F3F4F6')}];")
# FKs de autoria (quem criou/registrou/alterou) apontam para usuario em quase toda
# tabela; ficam cinza-claro e não influenciam o layout, para não poluir o diagrama.
AUTORIA = {"criado_por", "registrado_por", "registrada_por", "atualizado_por"}
for tabela, coluna, ref in fks:
    nulo = dict((c, n) for c, _, _, n, _ in colunas[tabela]).get(coluna)
    estilo = "dashed" if nulo == "YES" else "solid"
    if ref == "usuario" and (coluna in AUTORIA or tabela == "estoque_movimentacao"):
        dot.append(f'  {ref}:id -> {tabela}:{coluna} [style=dotted, color="#CBD5E1", constraint=false];')
    else:
        dot.append(f'  {ref}:id -> {tabela}:{coluna} [style={estilo}, penwidth=1.4];')
dot.append("}")

SAIDA.with_suffix(".dot").write_text("\n".join(dot), encoding="utf-8")
for formato in ("png", "svg"):
    extra = ["-Gdpi=150"] if formato == "png" else []
    subprocess.run(["dot", f"-T{formato}", *extra, str(SAIDA.with_suffix(".dot")),
                    "-o", str(SAIDA.with_suffix(f".{formato}"))], check=True)
print(f"DER gerado: {SAIDA}.png / .svg ({len(colunas)} tabelas, {len(fks)} relacionamentos)")
