#!/usr/bin/env python3
"""Convert simple NTF xlsx sheets to the PoC YAML shape.

The converter targets the table-oriented blocks used by Action request tests:
LIST_MAP, SETUP_TABLE, and EXPECTED_TABLE. Other markers are emitted as raw
comments so they are visible during follow-up design work.
"""

from __future__ import annotations

import argparse
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
TABLE_MARKER = re.compile(r"^(LIST_MAP|SETUP_TABLE|EXPECTED_TABLE)(\[\d+\])?=")
ANY_MARKER = re.compile(r"^[A-Z_]+(\[\d+\])?=")


def read_shared_strings(zip_file: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zip_file.namelist():
        return []
    root = ET.fromstring(zip_file.read("xl/sharedStrings.xml"))
    results = []
    for item in root.findall("a:si", NS):
        # <rPh> はフリガナ（ルビ）要素なので除外し、<r><t> と直下 <t> のみ使用する
        parts: list[str] = []
        for child in item:
            tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if tag == "rPh":
                continue  # フリガナをスキップ
            for t in child.findall(".//a:t", NS):
                parts.append(t.text or "")
            # 直下 <t>（<r> を介さない plain text）
            if tag == "t":
                parts.append(child.text or "")
        results.append("".join(parts))
    return results


def column_index(cell_ref: str) -> int:
    value = 0
    for char in "".join(char for char in cell_ref if char.isalpha()):
        value = value * 26 + ord(char.upper()) - 64
    return value - 1


def read_workbook(path: Path) -> list[tuple[str, list[list[str]]]]:
    sheets: list[tuple[str, list[list[str]]]] = []
    with zipfile.ZipFile(path) as zip_file:
        shared = read_shared_strings(zip_file)
        workbook = ET.fromstring(zip_file.read("xl/workbook.xml"))
        rels = ET.fromstring(zip_file.read("xl/_rels/workbook.xml.rels"))
        rel_by_id = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}

        for sheet in workbook.find("a:sheets", NS):
            rows: list[list[str]] = []
            target = rel_by_id[sheet.attrib[RID]]
            sheet_path = "xl/" + target.lstrip("/") if not target.startswith("xl/") else target
            root = ET.fromstring(zip_file.read(sheet_path))
            for row in root.findall(".//a:row", NS):
                values: list[str] = []
                for cell in row.findall("a:c", NS):
                    index = column_index(cell.attrib.get("r", "A1"))
                    while len(values) <= index:
                        values.append("")
                    raw = cell.find("a:v", NS)
                    if raw is None:
                        value = ""
                    elif cell.attrib.get("t") == "s":
                        value = shared[int(raw.text or "0")]
                    else:
                        value = raw.text or ""
                    values[index] = value
                while values and values[-1] == "":
                    values.pop()
                if values:
                    rows.append(values)
            sheets.append((sheet.attrib["name"], rows))
    return sheets


def quote(value: str) -> str:
    return '"' + str(value).replace("\\", "\\\\").replace('"', '\\"') + '"'


# YAML 1.1 でブール値として解析される予約語（SnakeYAML デフォルト）
_YAML_BOOL_WORDS = {
    "y", "yes", "n", "no", "true", "false", "on", "off",
}


def key(value: str) -> str:
    if re.match(r"^[A-Za-z0-9_.-]+$", value) and value.lower() not in _YAML_BOOL_WORDS:
        return value
    return quote(value)


def is_comment(row: list[str]) -> bool:
    return not row or not row[0] or row[0].startswith("//")


def is_marker(row: list[str]) -> bool:
    return bool(row and row[0] and ANY_MARKER.match(row[0]))


def collect_raw_rows(rows: list[list[str]], start: int) -> tuple[list[list[str]], int]:
    """次のマーカー行まで生行を収集して返す。
    // コメント行はスキップするが、先頭セルが空の行はデータ行として保持する。"""
    collected: list[list[str]] = []
    index = start
    while index < len(rows):
        current = rows[index]
        # // で始まる明示的なコメント行のみスキップ
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


def convert_sheet(rows: list[list[str]]) -> list[tuple[str, list[dict[str, str]] | str]]:
    blocks: list[tuple[str, list[dict[str, str]] | str]] = []
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
            # TABLE 以外のマーカーは後続行を生行リストとして保存
            raw_rows, index = collect_raw_rows(rows, index)
            blocks.append((marker, raw_rows))  # type: ignore[arg-type]
            continue

        while index < len(rows) and is_comment(rows[index]):
            index += 1
        if index >= len(rows) or is_marker(rows[index]):
            # 列名行もなし → 完全空ブロック
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
            item = {}
            for column, header in enumerate(headers):
                if not header:
                    continue
                item[header] = current[column] if column < len(current) else ""
            data_rows.append(item)
            index += 1
        if not data_rows:
            # 列名行はあるがデータ行なし → 列名を保持
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
            if isinstance(payload, str):
                lines.append(f"  {marker}: #Raw")
                lines.append(f"    {payload}")
                lines.append("")
                continue
            # 非TABLE マーカーの生行リスト（list[list[str]]）
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
                keys = list(item.keys())
                if not keys:
                    lines.append("    - {}")
                    continue
                first = keys[0]
                lines.append(f"    - {key(first)}: {quote(item[first])}")
                for column_key in keys[1:]:
                    lines.append(f"      {key(column_key)}: {quote(item[column_key])}")
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("-o", "--output", type=Path)
    args = parser.parse_args()

    text = render_yaml(read_workbook(args.source))
    if args.output:
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
