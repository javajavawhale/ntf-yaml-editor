# リファクタ候補

作成日: 2026-05-17

この文書は、`architecture-draft.md`、`open-decisions.md`、`test-inventory.md` から、リファクタリング候補を抽出する。
ここでは実装方針を確定せず、どこを直す価値があるか、どこはまだ触らないかを整理する。

## 優先度

| 優先度 | 意味 |
| --- | --- |
| P0 | 仕様判断済みで、実装・テストが追いついていない。リファクタ前に解消する。 |
| P1 | 仕様判断済みで、責務混在が大きい。リファクタ候補として上位に置く。 |
| P2 | 価値はあるが、先に意味論を安定させる。今は候補として残す。 |
| Hold | 今回は触らない。別 spec または別判断で扱う。 |

## 候補一覧

| ID | 候補 | 優先度 | 根拠 | 影響する責務 | 影響するビュー | 保存影響 | テスト影響 | 方針 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R-001 | 固定長ファイルブロックを file rows として編集・保存できるようにする | P0 | `open-decisions.md` の固定長判断、`status-baseline.md` の修正して採用 | NTF YAML Core, Editing Operations, Presentation | Normal Editor, SCM Diff head, Cell Diff, HTML Report | 高。固定長の編集結果を YAML に反映する必要がある。 | `ntfYamlModel.test.js`, `ntfYamlEditorWebview.test.js` に edit/save 仕様テストを追加・修正する。 | 最優先。readonly 前提と raw 保存前提を外す。 |
| R-002 | SCM Diff head を Normal Editor と同じ編集対象として扱う | P0 | `open-decisions.md` の編集可否方針 | Entry / IO, Presentation, Editing Operations | SCM Diff | 中。head 側だけ保存経路に到達する。 | E2E または Webview test で base readonly / head editable を確認する。 | 固定長対応と同時に確認する。 |
| R-003 | block の扱い判定を整理する | P1 | `architecture-draft.md` の block の扱い棚卸し | NTF YAML Core | 全ビュー | 中。通常 table / file rows / fallback 表示の扱いが保存と diff に波及する。 | Table Block, File Rows Block, fallback 表示の parse/diff/render テストを維持・追加する。 | `kind` 名や内部分類名に依存せず、表示・編集・diff の扱いで判断する。 |
| R-004 | ファイル系以外の NTF block を通常の Table Block として扱う | P1 | ユーザー確認済み NTF ドメイン知識、`test-inventory.md` の追加候補 | NTF YAML Core, Presentation, Diff | 全ビュー | 中。Table Block として保存・diff に載せる。 | prefix ごとの特別扱いに依存せず、通常 table として表示・編集・diff するテストを追加する。 | 個別 prefix を特例にしない。 |
| R-005 | view mode / readonly 判定を集約する | P1 | `architecture-draft.md` の view 差の重複、`open-decisions.md` の編集可否方針 | Entry / IO, Presentation | Normal Editor, SCM Diff, Cell Diff, HTML Report | 中。保存可能ビューと readonly ビューを誤ると破壊的。 | Webview test と E2E で view ごとの編集可否を確認する。 | view ごとの差を表示補助 helper に寄せる。独立した View Model 層は作らない。 |
| R-006 | Diff の意味論と HTML 生成の混在を減らす | P1 | `architecture-draft.md` の `lib/ntfYamlDiff.js` 現状リスク | Diff, Presentation | Cell Diff, HTML Report, SCM Diff | 低。直接保存しないが diff report の意味に影響する。 | diff report の構造テストを維持し、HTML 断片比較に寄せすぎない。 | まず diff report の意味を守る。HTML 分離は小さく進める。 |
| R-007 | Git / URI / working tree 解決を Entry / IO として閉じ込める | P1 | `architecture-draft.md` の Entry / IO 境界 | Entry / IO, Diff | SCM Diff, Cell Diff, HTML Report | 低。保存先解決には注意が必要。 | Git ref diff、working tree/index diff の integration test を維持する。 | Diff の意味論へ VS Code URI の都合を漏らさない。 |
| R-008 | Webview 内の編集操作を Editing Operations として切り出す | P2 | `architecture-draft.md` の UI 都合の混入 | Editing Operations, Presentation, NTF YAML Core | Normal Editor, SCM Diff head | 高。編集操作は保存結果に直結する。 | Webview DOM test に加え、純粋関数テストを追加する余地がある。 | 固定長と block の扱いが安定してから着手する。 |
| R-009 | テスト fixture の根拠種別を整理する | P1 | `test-inventory.md`、`status-baseline.md` | Test / Fixture | 全ビュー | なし。仕様根拠の信頼性に影響する。 | fixture の由来が分かるようにし、example 由来でないものを仕様根拠にしない。 | リファクタ前の safety net 整理として実施する。 |
| R-010 | 生成 HTML を仕様根拠から外す運用にする | P2 | `status-baseline.md`、`test-inventory.md` | Test / Fixture, Presentation | HTML Report | なし。 | 生成手順付きで必要時だけ再生成する。 | tracked 生成物を根拠として読ませない。 |
| R-011 | NTF YAML Analysis をビュー系フローから切り離す | P1 | `architecture-draft.md` の対象外責務、`glossary.md` の用語整理 | Entry / IO, NTF YAML Analysis | Normal Editor, SCM Diff, Cell Diff, HTML Report | なし。 | E2E はビューから diagnostics が出ないことを確認する。CLI lint test は維持する。 | CLI lint の既存機能として残し、ビューでは呼ばない。 |

## 今回は候補から外すもの

| 対象 | 理由 |
| --- | --- |
| Domain Model 層の新設 | 根本課題は独立 model 層の不足ではなく、block の扱いとビュー責務の曖昧さである。先に層を作ると未確定判断を API として固定しやすい。 |
| Serializer 層の新設 | 保存の責務は重要だが、今回の方式設計では独立層を先に作らない。固定長 edit/save の不足を先に解消する。 |
| Validation / NTF YAML Analysis の拡充 | 今回のビュー仕様では呼び出さない。CLI lint を扱う別作業で判断する。 |
| View Model 層の新設 | 先に独立層を作ると過剰。readonly 判定や構造セルが複雑化した場合だけ helper として切り出す。 |
| 固定長専用表モデル | `open-decisions.md` で採用しない判断済み。将来拡張候補にも置かない。 |
| Column Order の実装方式変更 | 生 YAML の仕様ではなく既存実装の補助データである。今回の spec の責務外として扱う。 |

## 影響評価

`仕様矛盾数` は、この候補に直接関係する文書上の矛盾または不整合の数を数える。
`要確認/要修正テスト数` は、`test-inventory.md` で追加・修正候補として扱うテスト単位の数を数える。

| ID | 仕様矛盾数 | 要確認/要修正テスト数 | ビュー影響 | 保存影響 | 変更範囲 |
| --- | --- | --- | --- | --- | --- |
| R-001 | 3 | 2 | 4ビュー | 高 | `lib/ntfYamlModel.js`, `media/ntfYamlEditorWebview.js`, model/webview tests |
| R-002 | 1 | 1 | SCM Diff | 中 | `extension.js`, `media/ntfYamlEditorWebview.js`, e2e/webview tests |
| R-003 | 2 | 2 | 全ビュー | 中 | `lib/ntfYamlModel.js`, `lib/ntfYamlDiff.js`, webview rendering |
| R-004 | 1 | 1 | 全ビュー | 中 | `lib/ntfYamlModel.js`, diff/webview tests |
| R-005 | 2 | 2 | 全ビュー | 中 | `extension.js`, `lib/ntfYamlWebviewHtml.js`, `media/ntfYamlEditorWebview.js` |
| R-006 | 1 | 1 | Cell Diff, HTML Report, SCM Diff | 低 | `lib/ntfYamlDiff.js`, `lib/ntfYamlWebviewHtml.js` |
| R-007 | 0 | 1 | SCM Diff, Cell Diff, HTML Report | 低 | `lib/ntfYamlGitDiffContext.js`, extension entrypoints |
| R-008 | 1 | 2 | Normal Editor, SCM Diff head | 高 | `media/ntfYamlEditorWebview.js`, possible Core helper functions |
| R-009 | 2 | 0 | 全ビュー | なし | `test/fixtures/**`, fixture README |
| R-010 | 1 | 0 | HTML Report | なし | generated HTML artifact handling |
| R-011 | 1 | 1 | 全ビュー | なし | `extension.js`, e2e diagnostics expectation |

## 推奨順序

1. R-001 固定長 file rows の edit/save
2. R-002 SCM Diff head editable
3. R-003 block の扱い判定整理
4. R-004 ファイル系以外の NTF block の通常 table 対応
5. R-005 view mode / readonly 判定集約
6. R-009 fixture 根拠種別整理

R-006、R-007、R-008、R-010、R-011 は、上記の仕様意味論が崩れないことを確認しながら進める。

## レビュー観点

- P0 / P1 の優先度に違和感がないか。
- 保存影響が高い候補を先に扱う順序でよいか。
- `今回は候補から外すもの` に、誤って今回やるべきものが入っていないか。
- 固定長と SCM Diff head の実装修正を、同じ変更単位にするか分けるか。
