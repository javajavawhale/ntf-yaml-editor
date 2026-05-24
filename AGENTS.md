<claude-mem-context>
# Memory Context

# [vscode-ntf-yaml-editor] recent context, 2026-05-24 12:29pm GMT+9

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (15,915t read) | 1,524,284t work | 99% savings

### May 3, 2026
S32 cc-sddのアンインストールと最新版の再インストール (May 3, 12:36 AM)
S33 vscode-ntf-yaml-editor への差分表示機能追加 — grill-me ヒアリングで要件を抽出し、機能企画を固める (May 3, 12:55 AM)
### May 4, 2026
123 4:54p 🔵 NTF YAMLエディタの行・列移動と名前重複防止の実装詳細
125 5:01p 🔵 SETUP_VARIABLE/EXPECTED_VARIABLE の RawRows 実データ構造の確認
126 5:03p 🟣 vscode-ntf-yaml-editor UI大規模改修：Save位置移動・空名即時追加・D&D並び替え・RawRows表示改善
127 " ⚖️ Remove ↑↓ Move Buttons in Favor of D&D
### May 5, 2026
128 10:39a 🔵 Button-Based Move Controls: Full Inventory Before Removal
129 " 🔄 Removed ↑↓←→ Move Buttons from All Tables
130 10:40a 🔄 Tests Updated to Remove Move-Button Assertions, Use D&D Instead
131 " 🔴 Test 15 Still Failing After Move-Button Removal — Stale doesNotMatch Assertion
132 10:41a 🟣 Move-Button Removal Complete — 37/37 Tests Pass
133 " 🔵 Playwright 1.59.1 Available in Project
134 " ✅ Webview Unit Tests: 16/16 Pass — Move-Button Removal Verified Clean
135 10:42a 🔵 Playwright Not Installed as Node Module in Project
136 " 🔵 HTML Preview Generation Failed — CSS Extraction Regex Doesn't Match
137 " 🔵 Standalone HTML Preview + Playwright Screenshot Technique Works
138 " 🔵 Visual Screenshot of NTF YAML Editor with Batch Fixture Captured for SETUP_VARIABLE Inspection
155 10:43a 🔵 Highlight Logic Bug: NTF File Generation vs Generic Data Format Spec Confusion
### May 6, 2026
158 12:18a 🔵 NTF YAMLセル差分機能の設計と実装状況
159 12:19a 🔵 セル差分機能の完全実装を確認（lib/ntfYamlDiff.js）
160 " 🔵 全39ユニットテスト通過（セル差分テスト含む）
162 12:21a 🔵 セル差分機能のgit履歴：masterに実装済み、UI改善コミットが未プッシュ
164 " 🔵 VS Code拡張でntf.yaml差分クリック時に生YAMLではなくカスタムエディタプレビューが2つ開く問題
165 " 🔵 「プレビューが2つ出る」問題の調査計画を立案
166 12:27a 🔵 「プレビュー2つ」の根本原因：package.jsonのcustomEditor priority "default"がGit diffに介入
167 12:28a 🔵 既存実装の責務境界：テーブル編集UIとセル差分は完全に分離された独立モジュール
168 " ⚖️ 「プレビュー2つ」問題のアーキテクチャ調査が完了、推奨案と承認ポイントが確定
169 " 🔵 vscode-ntf-yaml-editorのCodexメモリに実装ルール3点が記録されている
170 2:42p ✅ Codexメモリにアーキテクチャ判断ルールを追加（ルール4）
171 2:43p ⚖️ アーキテクチャ案A〜Cの技術検証計画に切り替え：先送りなしの恒久方針策定へ
172 " 🔵 VS Code型定義（vscode.d.ts）がnode_modulesに存在しない、API検証にはDeepWikiか公式ドキュメント参照が必要
173 2:44p 🔵 VS Code 1.118.1テストバイナリとGit拡張がローカルに存在、API調査に利用可能
174 " 🔄 vscode-ntf-yaml-editor: e2e probe commands removed from extension.js
175 " 🔄 vscode-ntf-yaml-editor: Git SCM test cases removed from e2e suite
176 " ✅ vscode-ntf-yaml-editor: test/fixtures/workspace cleaned of stray git repo
177 " 🔵 vscode-ntf-yaml-editor: all tests green after SCM probe cleanup — 39 unit + 7 e2e
178 2:50p 🔵 vscode-ntf-yaml-editor: diff feature design plan — two prototype approaches identified
179 2:59p 🟣 ntfYamlDiff.js exports new `diffFile` function
### May 23, 2026
308 3:41p 🔵 TC-NE-02#11: 列削除ボタンが機能しない不具合を特定
309 " 🔵 TC-NE-02#11 列削除バグ: コードパス特定 — deleteColumn 後の再レンダリング欠落が疑われる
310 3:42p 🔵 列削除ハンドラに render() 呼び出しが存在することを確認 — 再レンダリング欠落仮説を棄却
311 " 🔵 列削除ユニットテスト全通過 — バグは VS Code 実環境固有、CSS の col-action-bar 表示制御が有力候補
312 3:43p 🔵 col-action-bar の CSS 表示ロジック全容確認 — focus-lock 状態での display:none が実環境バグの根本候補
313 " 🔵 E2E テストは列削除のインタラクションをカバーしていない — 手動テストのみが TC-NE-02 の検証手段
314 " 🔴 TC-NE-02#11 列削除バグ修正 — action-bar-delete の mousedown に event.preventDefault() を追加
315 3:47p 🟣 TC-NE-02#11 修正のリグレッションテスト追加 — 新テスト含む3件全通過
316 " 🔴 TC-NE-02#11 修正完了 — 全89ユニットテスト通過、差分確定
317 11:25p 🔵 editor-comprehensive.ntf.yaml fixture was hand-crafted, not converter-generated
318 11:38p 🔵 git blame traces EXPECTED_FIXED block origin to table-ui-current-spec.ntf.yaml (commit 81f1453a, 2026-05-11)
319 11:39p 🟣 RawRows auxiliary first cell (補助セル) rendering implemented
320 " ✅ Spec docs updated with 補助セル (auxiliary cell) concept
321 " ✅ Test coverage added for auxiliary first cell assertions in webview tests

Access 1524k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>

## Project Terminology

Use `docs/glossary.md` as the terminology source of truth when discussing,
refactoring, naming files, or naming code concepts in this project.

In particular:

- `Model`, `Sheet`, `Block`, `Row`, and `Cell` refer to the NTF YAML internal structure.
- `Cell Diff`, `SCM Diff`, `Standalone HTML Report`, and `Normal Editor` are distinct views and must not be conflated.
- `Canonical Form` is the shared output target for converter output, editor save, and CLI format.
