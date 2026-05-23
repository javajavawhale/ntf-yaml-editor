# テスト資産の軽量一覧

作成日: 2026-05-17

## 自動テスト

| test file | 主な対象 | 分類 | 根拠 | リファクタ時の扱い |
| --- | --- | --- | --- | --- |
| `test/ntfYamlModel.test.js` | Table Block parse/serialize、特殊 key、null/empty string、sample fixture | 仕様テスト | example fixture、既存 converter 形状 | 維持。parser/serializer 変更時の safety net。 |
| `test/ntfYamlModel.test.js` | ファイル系 table parse/serialize、multiline rows、ragged rows | 仕様テスト | example fixture、既存 docs | 維持。ファイル系 table 仕様変更時は根拠を明記して更新。 |
| `test/ntfYamlModel.test.js` | fixed-length parse/diff/save | 仕様テスト | ユーザー確認済み NTF ドメイン知識、`docs/spec-governance/open-decisions.md` | 編集後の fixed-length rows が YAML に保存されることを追加する。 |
| `test/ntfYamlModel.test.js` | diagnostics、testShots references | CLI lint 既存機能の characterization | NTF YAML の参照関係、既存実装 | ビュー系フローの根拠にしない。CLI lint を扱う時まで維持する。 |
| `test/ntfYamlModel.test.js` | CLI lint/convert/format/diff、Git ref diff、working tree/index diff | integration / characterization | 現行 CLI と Git 連携 | リファクタ時の差分検知に使う。仕様根拠にする箇所は分離。 |
| `test/ntfYamlModel.test.js` | row/cell diff、sheet/block status、headIndex | 仕様テスト + characterization | `docs/cell-diff-design.md`、現行 diff report | diff engine 変更前に維持。未確定の fixed-length 部分だけ要確認。 |
| `test/ntfYamlEditorWebview.test.js` | Webview の通常 table 編集、ファイル系 table 編集、保存 message | 仕様テスト | Normal Editor の編集体験 | 維持。ViewModel 分離時の safety net。 |
| `test/ntfYamlEditorWebview.test.js` | diff overlay、SCM base/head、unified view | 仕様テスト + regression | Cell Diff / SCM Diff 表示 | 維持。renderer 分割時の safety net。 |
| `test/ntfYamlEditorWebview.test.js` | fixed-length 表示・編集 | 仕様テスト | ユーザー確認済み NTF ドメイン知識、`open-decisions.md` の固定長判断 | readonly 前提を外し、編集保存を確認する。 |
| `test/ntfYamlExtensionUtils.test.js` | Git URI、resource collection、path 判定、diagnostic line | unit | VS Code 連携 utility | 維持。入口 adapter 分離時に移行。 |
| `test/e2e/suite/` | VS Code command/custom editor/export | e2e | VS Code 実行環境 | public behavior の確認だけに絞って維持。ビュー系フローで diagnostics を出さないことを確認する。 |

## Fixture

| test file | 主な対象 | 分類 | 根拠 | リファクタ時の扱い |
| --- | --- | --- | --- | --- |
| `test/fixtures/ntf-samples/` | representative NTF YAML | example 由来 | `/home/happy/nablarch/samples/nablarch-example-*` | 最優先の仕様根拠として維持。 |
| `test/fixtures/manual/` | 手動 UI 確認 | 手動確認用 | `docs/manual-test-plan.md` | 自動テスト根拠にしない。手順更新時に合わせる。 |
| `test/fixtures/diff-scenarios/` | SCM diff 手動 scenario | 手動確認用 | 確認直前に head 内容で上書きして diff を作るための入力 | SCM diff が見えることを確認できればよい。仕様根拠にしない。 |
| `test_fixtures_diff-scenarios_cell-diff-head.ntf.yaml-diff.html` | 生成 HTML | 採用しない | 生成物 | 削除済み。必要なら fixture から再生成し、コミットしない。 |

## 追加・修正候補

| 対象 | 種別 | 理由 |
| --- | --- | --- |
| fixed-length edit/save | 追加 | 固定長ブロックは可変長と同じファイル系表として編集保存するため。 |
| ファイル系以外の NTF block の通常 table 表示 | 追加 | `VARIABLE` / `FIXED` 系以外を prefix ごとに特別扱いせず、通常の Table Block として表示・編集・diff する前提を固定するため。 |
| diff scenario fixture | 修正候補 | 確認直前に head 内容で上書きする運用に README を合わせる。 |
