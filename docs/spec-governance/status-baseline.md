# 現状変更の採否判断

作成日: 2026-05-17

## 判断方針

現状変更は stash で退避せず、恒久対応の入口として分類する。
NTF YAML の意味、保存結果、diff 結果、ビューの操作可否に影響する変更は、仕様根拠またはユーザー確認が揃うまで確定コミットの対象にしない。

## Safety baseline

実行コマンド:

```bash
npm run test:unit
```

結果:

- tests: 83
- pass: 83
- fail: 0

## コミット判断

| 対象 | 判断 | コミット可否 | 理由 |
| --- | --- | --- | --- |
| `.kiro/specs/specification-governance-reset/requirements.md` | 採用する | 可 | レビュー済みの根本課題と要件。 |
| `.kiro/specs/specification-governance-reset/design.md` | 採用する | 可 | レビュー済みの仕様統制設計。 |
| `.kiro/specs/specification-governance-reset/tasks.md` | 採用する | 可 | 仕様統制の実行計画。 |
| `docs/spec-governance/` | 採用する | 可 | 現状判断、棚卸し、リライト判断の成果物置き場。 |
| `lib/ntfYamlModel.js` | 修正して採用する | 不可 | 固定長ファイルブロックをファイル系表として行配列化する方向は採用する。ただし保存時に固定長編集を YAML に反映できないため修正が必要。 |
| `lib/ntfYamlDiff.js` | 採用する | 可 | 固定長ファイルブロックを可変長ファイルと同じファイル系表 diff に載せる。 |
| `media/ntfYamlEditorWebview.js` | 修正して採用する | 不可 | 固定長ファイルブロックを表表示する方向は採用する。ただし通常エディタで readonly にしているため、編集可能に修正する。 |
| `test/ntfYamlModel.test.js` | 修正して採用する | 不可 | 固定長ファイルブロックの表示用 parse と diff は採用する。raw 保存前提のテストは、編集保存を確認する仕様テストへ修正する。 |
| `test/ntfYamlEditorWebview.test.js` | 修正して採用する | 不可 | 固定長ファイルブロックの Webview 表示は採用する。readonly 前提のテストは、編集保存を確認する仕様テストへ修正する。 |
| `docs/file-block-display-spec.md` | 採用する | 可 | 固定長ファイルを可変長ファイルと同じファイル系表として扱う仕様に更新する。 |
| `docs/rawrows-diff-spec.md` | 採用する | 可 | ファイル系 table と固定長ファイルの共有 diff 方針に更新する。 |
| `test/fixtures/diff-scenarios/cell-diff-base.ntf.yaml` | 採用しない | 削除済み | base 内容は `test/fixtures/diff-scenarios/README.md` の手順内で作成する。 |
| `test/fixtures/diff-scenarios/cell-diff-head.ntf.yaml` | 修正して採用する | README 更新後 | SCM diff を作るための上書き用 fixture として扱う。仕様根拠にはしない。 |
| `test/fixtures/manual/cell-diff-ui-head.ntf.yaml` | 採用する | 可 | 手動確認 fixture のファイル系 table 表記ゆれを調整している。仕様根拠ではなく手動確認データとして扱う。 |
| `test/fixtures/manual/rawrows-ui-case.ntf.yaml` | 採用する | 可 | 手動確認 fixture の差分が分かりやすくなるデータ追加。仕様根拠ではなく手動確認データとして扱う。 |
| `test_fixtures_diff-scenarios_cell-diff-head.ntf.yaml-diff.html` | 採用しない | 削除済み | 生成 HTML は仕様根拠にしない。必要な場合は fixture から再生成し、コミットしない。 |

## 恒久対応タスク

- 固定長ファイルブロックの表示・編集・保存・diff 方針を `docs/file-block-display-spec.md` と `docs/rawrows-diff-spec.md` へ反映する。
- diff scenario fixture は、確認直前に head 内容で上書きして SCM diff を作る運用として README を更新する。
- 固定長関連テストは、編集保存を含む仕様テストとして扱う。
- 生成 HTML はソースとして管理しない。必要な場合は fixture から再生成し、コミットしない。
