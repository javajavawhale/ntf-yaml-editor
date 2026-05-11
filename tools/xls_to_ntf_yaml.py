#!/usr/bin/env python3
"""Convert NTF xls (old binary format) sheets to the PoC YAML shape.

Uses xlrd to read .xls files and reuses the same render logic as
xlsx_to_ntf_yaml.py.  Supports LIST_MAP, SETUP_TABLE, EXPECTED_TABLE
and emits other markers as #RawRows.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import xlrd  # pip install xlrd

TABLE_MARKER = re.compile(r"^(LIST_MAP|SETUP_TABLE|EXPECTED_TABLE)(\[\d+\])?=")
ANY_MARKER = re.compile(r"^[A-Z_]+(\[\d+\])?=")


# ---------------------------------------------------------------------------
# Reader
# ---------------------------------------------------------------------------

def read_workbook(path: Path) -> list[tuple[str, list[list[str]]]]:
    wb = xlrd.open_workbook(str(path))
    sheets: list[tuple[str, list[list[str]]]] = []
    for sh in wb.sheets():
        rows: list[list[str]] = []
        for r in range(sh.nrows):
            row: list[str] = []
            for c in range(sh.ncols):
                cell = sh.cell(r, c)
                if cell.ctype == xlrd.XL_CELL_EMPTY:
                    value = ""
                elif cell.ctype == xlrd.XL_CELL_NUMBER:
                    v = cell.value
                    value = str(int(v)) if v == int(v) else str(v)
                elif cell.ctype == xlrd.XL_CELL_BOOLEAN:
                    value = "true" if cell.value else "false"
                elif cell.ctype == xlrd.XL_CELL_DATE:
                    dt = xlrd.xldate_as_datetime(cell.value, wb.datemode)
                    value = dt.strftime("%Y%m%d")
                else:
                    value = str(cell.value)
                row.append(value)
            # strip trailing empties
            while row and row[-1] == "":
                row.pop()
            if row:
                rows.append(row)
        sheets.append((sh.name, rows))
    return sheets


# ---------------------------------------------------------------------------
# Renderer (shared with xlsx_to_ntf_yaml.py)
# ---------------------------------------------------------------------------

_YAML_BOOL_WORDS = {"y", "yes", "n", "no", "true", "false", "on", "off"}


def quote(value: str) -> str:
    return '"' + str(value).replace("\\", "\\\\").replace('"', '\\"') + '"'


def key(value: str) -> str:
    if re.match(r"^[A-Za-z0-9_.-]+$", value) and value.lower() not in _YAML_BOOL_WORDS:
        return value
    return quote(value)


def is_comment(row: list[str]) -> bool:
    return not row or not row[0] or row[0].startswith("//")


def is_marker(row: list[str]) -> bool:
    return bool(row and row[0] and ANY_MARKER.match(row[0]))


def collect_raw_rows(rows: list[list[str]], start: int) -> tuple[list[list[str]], int]:
    collected: list[list[str]] = []
    index = start
    while index < len(rows):
        current = rows[index]
        if current and current[0] and current[0].startswith("//"):
            index += 1
            continue
        if is_marker(current):
            break
        if not current:
            index += 1
            continue
        collected.append(current)
        index += 1
    return collected, index


def convert_sheet(rows: list[list[str]]) -> list[tuple[str, object]]:
    blocks: list[tuple[str, object]] = []
    index = 0
    while index < len(rows):
        row = rows[index]
        if is_comment(row):
            index += 1
            continue
        marker = row[0]
        if not ANY_MARKER.match(marker):
            index += 1
            continue

        index += 1

        if not TABLE_MARKER.match(marker):
            raw_rows, index = collect_raw_rows(rows, index)
            blocks.append((marker, raw_rows))
            continue

        while index < len(rows) and is_comment(rows[index]):
            index += 1
        if index >= len(rows) or is_marker(rows[index]):
            blocks.append((marker, []))
            continue

        headers = rows[index]
        index += 1
        data_rows: list[dict[str, str]] = []
        while index < len(rows):
            current = rows[index]
            if is_comment(current):
                index += 1
                continue
            if is_marker(current):
                break
            item: dict[str, str] = {}
            for column, header in enumerate(headers):
                if not header:
                    continue
                item[header] = current[column] if column < len(current) else ""
            data_rows.append(item)
            index += 1
        if not data_rows:
            blocks.append((marker, {"__columns__": headers}))
        else:
            blocks.append((marker, data_rows))
    return blocks


def render_yaml(workbook: list[tuple[str, list[list[str]]]]) -> str:
    lines: list[str] = []
    for sheet_name, rows in workbook:
        lines.append(f"{sheet_name}:")
        blocks = convert_sheet(rows)
        for marker, payload in blocks:
            if isinstance(payload, list) and (not payload or isinstance(payload[0], list)):
                lines.append(f"  {marker}: #RawRows")
                for raw_row in payload:
                    cells = "[" + ", ".join(quote(c) for c in raw_row) + "]"
                    lines.append(f"    - {cells}")
                lines.append("")
                continue
            if isinstance(payload, dict) and "__columns__" in payload:
                # データ行なし・列名のみのテーブル
                # sentinel 行: 全値 ~ (YAML null) で列名を定義する。
                # YamlReader は先頭行が全値 null のとき列定義のみと判断し INSERT しない。
                cols = payload["__columns__"]
                lines.append(f"  {marker}: #ListMap")
                first, *rest = cols
                lines.append(f"    - {key(first)}: ~")
                for c in rest:
                    lines.append(f"      {key(c)}: ~")
                lines.append("")
                continue
            lines.append(f"  {marker}: #ListMap")
            for item in payload:
                keys_list = list(item.keys())
                if not keys_list:
                    lines.append("    - {}")
                    continue
                first = keys_list[0]
                lines.append(f"    - {key(first)}: {quote(item[first])}")
                for k in keys_list[1:]:
                    lines.append(f"      {key(k)}: {quote(item[k])}")
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Convert NTF .xls to .yaml")
    parser.add_argument("source", type=Path)
    parser.add_argument("-o", "--output", type=Path)
    args = parser.parse_args()

    text = render_yaml(read_workbook(args.source))
    if args.output:
        args.output.write_text(text, encoding="utf-8")
        print(f"Written: {args.output}", file=sys.stderr)
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
