# Steering 見直し記録

作成日: 2026-05-17

この文書は、Steering と用語集を見直した判断の記録である。
ASIS は見直し開始時点の記載、TOBE は更新後に残す方針を表す。

## レビュー済みのこと

この文書で確認したのは、Steering 本体の見直し対象と、更新後に残す方針である。
各行について、次を判断した。

- `ASIS` の現状認識が合っているか。
- `TOBE` の方向で Steering を更新してよいか。
- `関連確認` に書いた後続文書で判断すべきか、すでにこの場で確定できるか。

文言の細かさは Steering 更新時に整えた。
長期原則として Steering に残す内容と、spec / open decisions に置く内容を分けた。

## 見直し候補一覧

| 対象 | ASIS | TOBE | 関連確認 |
| --- | --- | --- | --- |
| `.kiro/steering/product.md` | 「共有 NTF YAML モデル」という言葉が、確立済みの仕様名や層名のように読める。 | 「NTF YAML の構造解釈に基づいて表示・編集・diff を扱う」に置き換える。 | [architecture-draft.md](architecture-draft.md) の責務境界、Steering 更新時の文言調整 |
| `.kiro/steering/product.md` | 「VS Code と HTML レポートは、同じ単一表統合ビューを共有する」としている。SCM Diff は VS Code が左右ペインを管理し、Cell Diff / HTML Report とビュー構成が違う。 | 共有する対象を「表示意味・diff 意味・コンポーネント」に寄せる。ビュー構成はビュー別に書く。 | [architecture-draft.md](architecture-draft.md) のビュー別棚卸し |
| `.kiro/steering/structure.md` | `lib/` を「解析、シリアライズ、分析、分類、将来の差分ロジック」とまとめている。 | Steering では大分類だけに留め、レビュー可能な責務境界は方式設計へ置く。 | [architecture-draft.md](architecture-draft.md) |
| `.kiro/steering/structure.md` | `test/fixtures/ntf-samples/` を NTF サンプル fixture 置き場としている。現状は example 由来、合成、手動確認、生成出力が混在している。 | fixture は根拠種別が分かる配置・命名にする。example 由来でない fixture を仕様根拠にしない。 | [test-inventory.md](test-inventory.md) |
| `.kiro/steering/tech.md` | 「Excel 移行、ローカル編集、レビュー、差分で同じ構造解釈を使う」としている。実装上の shared model 前提に読める。 | まず NTF YAML の構造解釈を揃える。実装共有はその結果として扱う。 | [architecture-draft.md](architecture-draft.md) の責務境界、Steering 更新時の文言調整 |
| `.kiro/steering/ntf-yaml-domain.md` | 固定長ファイルブロックを「レコード種別ごとの表としてモデル化する」としている。 | 固定長は可変長と同じファイル系表として扱う。レコード種別ごとの専用モデルは採用しない。 | [open-decisions.md](open-decisions.md) の固定長ファイル判断 |
| `.kiro/steering/ntf-yaml-domain.md` | 「NTF YAML は正規化してシリアライズされた YAML として運用する」としている。 | canonical form は長期目標に留める。保存結果の意味と NTF 実行可能性を先に確認する。 | [architecture-draft.md](architecture-draft.md) の保存責務、Steering 更新時の文言調整 |
| `.kiro/steering/ntf-yaml-domain.md` | RawRows は行番号と列番号、固定長は行番号とフィールド名称を使うとしている。 | 固定長もファイル系表として行配列と列位置で比較する。 | [open-decisions.md](open-decisions.md) の固定長 diff 判断 |
| `docs/glossary.md` | `Canonical Form` を converter output / editor save / CLI format 共有の正規形として定義していた。 | 用語の意味としては長期目標を指す言葉に留め、仕様状態は `open-decisions.md` や方式設計で管理する。 | 反映済み |
| `docs/glossary.md` | `Raw Block` に `SETUP_FIXED` / `EXPECTED_FIXED` を含めていた。 | fixed-length は file rows として定義し、採否や確認状態は用語集では管理しない。 | 反映済み |

## 更新方針

- Steering は、長期的な原則だけに絞る。
- NTF YAML の意味、保存、diff、ビュー差は、確定するまで spec または `docs/spec-governance/open-decisions.md` に置く。
- 用語集は言葉の意味だけを定義し、確定、要確認、却下、実装状況は別文書で管理する。
- 固定長ファイルブロック、通常表示方針、canonical form の扱いは Steering へ反映済み。
