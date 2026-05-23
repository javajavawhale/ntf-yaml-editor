# 判断記録

作成日: 2026-05-17

## 固定長ファイルブロック

### 確定した前提

`SETUP_FIXED` / `EXPECTED_FIXED` は、`SETUP_VARIABLE` / `EXPECTED_VARIABLE` と同じファイル系表として扱う。
ディレクティブ行は固定長ファイル固有の値を持つが、ディレクティブ行以外の表構造、表示、差分の基本仕様は可変長ファイルと同じである。

この判断はユーザー確認済みの NTF ドメイン知識を根拠にする。
根拠は、固定長ファイルと可変長ファイルのディレクティブ行以外の仕様が同一であるという確認である。

### 文書間の差

| 文書 | 記載 | 状態 |
| --- | --- | --- |
| `docs/cell-diff-design.md` | 固定長ファイルブロックを可変長と同じファイル系表として扱い、行番号と列番号で比較する。 | 現行仕様に一致。 |
| `docs/file-block-display-spec.md` | 固定長ファイルと可変長ファイルを同じファイル系表として扱い、編集後の行配列を YAML に保存し、行配列の LCS と列位置で diff する。 | 現行仕様に一致。 |
| `docs/rawrows-diff-spec.md` | 固定長を `VARIABLE` と同じファイル系 table として構造化表示・差分表示する。 | 現行仕様に一致。 |
| `.kiro/steering/ntf-yaml-domain.md` | 固定長ファイルを可変長と同じファイル系表として扱う。 | 現行仕様に一致。 |

### 判断

| 対象 | 判断案 | 根拠 | 影響するビュー | 保存影響 | diff 影響 | 残るリスク |
| --- | --- | --- | --- | --- | --- | --- |
| 固定長ファイルの現行仕様 | 可変長ファイルと同じファイル系表として表示・編集・保存・差分する | ユーザー確認済みの NTF ドメイン知識。ディレクティブ行以外は可変長ファイルと同じ仕様。 | Normal Editor, SCM Diff, Cell Diff, HTML Report | Normal Editor と SCM Diff head 側で編集した固定長ブロックの行配列を YAML に保存する。 | 行配列の LCS と列位置で比較する。 | 現行実装は固定長を readonly にしており、保存時に固定長編集を反映できないため、実装修正が必要。 |
| レコード種別ごとの専用モデル | 採用しない | 可変長ファイルと同じファイル系表で、表示・編集・保存・差分の価値を提供できる。専用モデルは、ユーザーに追加のレビュー価値を提供せず、実装と仕様確認の負荷だけを増やす。 | 全ビュー | 専用 serializer は作らない。ファイル系表 serializer で扱う。 | フィールド名称を列同一性にしない。 | なし。固定長専用表モデルは将来拡張候補にも置かない。 |
| raw text のみ表示 | 採用しない | ファイル系表としてレビューできなくなる。 | 全ビュー | 保存安全性は高いが、レビュー価値が低い。 | raw text diff になる。 | 固定長のセル差分を確認できない。 |

## 編集可否方針

| 対象 | 判断案 | 根拠 | 影響するビュー | 保存影響 | diff 影響 | 残るリスク |
| --- | --- | --- | --- | --- | --- | --- |
| Normal Editor の固定長ファイルブロック | `SETUP_VARIABLE` / `EXPECTED_VARIABLE` と同じファイル系表として編集可能にする | 固定長と可変長は、ディレクティブ行以外の仕様が同じである。 | Normal Editor | セル編集、行/列操作、並び替えを YAML に反映する。 | なし | 現行実装の readonly 制御と保存処理を修正する必要がある。 |
| Normal Editor の `SETUP_VARIABLE` / `EXPECTED_VARIABLE` | 現行どおり編集可 | example 由来 YAML があり、既存テストもある。 | Normal Editor | 現行 serializer の影響を受ける。 | なし | コメント位置や表記保持は別途確認が必要。 |
| SCM Diff の base 側 | readonly | base 側は `git://` の比較元であり、保存先ではない。 | SCM Diff | なし | 比較元として表示する。 | なし |
| SCM Diff の head 側 | 編集可能 | head 側は `file://` の作業ツリーファイルであり、Normal Editor と同じ編集対象である。 | SCM Diff | セル編集、行/列操作、並び替えを YAML に反映する。 | 編集前後の差分を head 側で確認できる。 | 現行実装で固定長だけ readonly になっている箇所を修正する必要がある。 |
| Cell Diff のファイル系ブロック | readonly | ref 比較とレビュー文脈。 | Cell Diff | なし | 表示だけ。 | なし |
| HTML Report のファイル系ブロック | readonly | 静的レポート。 | HTML Report | なし | 表示だけ。 | なし |

## 通常表示方針

ファイル指定を持つ `VARIABLE` / `FIXED` 系 block 以外は、通常の Table Block として扱う。
prefix ごとに特別な表示区分を作らず、通常の表表示・編集・diff の経路に載せる。

| 対象 | 判断案 | 根拠 | 影響するビュー | 保存影響 | diff 影響 | 残るリスク |
| --- | --- | --- | --- | --- | --- | --- |
| `VARIABLE` / `FIXED` 系以外の NTF block | 通常の Table Block として表示・編集・保存・差分する | ユーザー確認済みの NTF ドメイン知識。ファイル指定を持つ2系統だけが file rows として扱う対象である。 | Normal Editor, SCM Diff, Cell Diff, HTML Report | Normal Editor と SCM Diff head 側で編集した table row を YAML に保存する。 | object row の表としてセル単位で比較する。 | 現行実装・テストが prefix ごとの特別扱いに依存していないか確認する。 |

## 反映タスク

- `docs/cell-diff-design.md` の固定長専用表モデルを、現行仕様と将来拡張候補から外す。
- `.kiro/steering/ntf-yaml-domain.md` の固定長 diff 同一性を、行配列と列位置の現行仕様に合わせる。
- 固定長関連テストを、表示・diff だけでなく編集保存も確認する仕様テストへ拡張する。
- `VARIABLE` / `FIXED` 系以外の NTF block が通常の Table Block 経路に載ることを確認し、不足する仕様テストを追加する。
- `media/ntfYamlEditorWebview.js` の固定長 readonly 制御を外し、ファイル系表として編集できるようにする。
- `lib/ntfYamlModel.js` の固定長 serializer を追加し、固定長ブロックの `rows` を YAML に反映する。
