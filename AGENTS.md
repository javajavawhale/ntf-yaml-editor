<claude-mem-context>
# Memory Context

# [vscode-ntf-yaml-editor] recent context, 2026-05-26 10:26pm GMT+9

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (17,757t read) | 3,322,399t work | 99% savings

### May 3, 2026
S33 vscode-ntf-yaml-editor への差分表示機能追加 — grill-me ヒアリングで要件を抽出し、機能企画を固める (May 3, 12:36 AM)
S32 cc-sddのアンインストールと最新版の再インストール (May 3, 12:36 AM)
S66 Fix suspicious left whitespace gap in SCM diff (readonly) view — architectural question about row-action visibility vs table left-edge alignment coexistence (May 3, 12:55 AM)
### May 6, 2026
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
### May 25, 2026
327 11:27a 🔴 カード内テーブル左余白の原因特定と修正 (D-003系統)
328 " 🔄 シート・ブロックのドラッグハンドル廃止 — カード全体をドラッグ可能に変更
329 " ✅ UI スクリーンショットテストに wide-table ページと cursor・padding アサーションを追加
322 " 🔵 SMC Diff Bug: Both Sides Show HEAD but Display Different Content
323 11:28a 🔴 Test fixes for gutter column DOM index shift in vscode-ntf-yaml-editor
324 " 🔵 Horizontal scrollbar bleeds past table left edge in Normal Editor — root cause identified
330 " 🔵 SCM diff view has residual left-whitespace bug after row-action-gutter fix
325 11:31a 🔵 Pre-refactor CSS used viewport left-expansion + webkit scrollbar-track offset to align scrollbar
326 " 🔵 Test run confirms 2 failures: Test 19 column drag uses wrong th index, Test 25 filler cell uses td:first-child
S67 Fix suspicious left whitespace gap in SCM diff (readonly) view — remove 18px padding-left from .table-scroll base class (May 25, 10:08 PM)
S68 Semantic merge analysis of diverged branches in vscode-ntf-yaml-editor — user asked whether the remote commit could be merged while understanding content meaning (May 25, 10:10 PM)
331 10:10p 🔵 User Reports UI Behavior Unchanged Despite Code Modifications to Action Gutter and Drag Handles
### May 26, 2026
332 10:56a ⚖️ UIチェックリスト圧縮方針 — SCM diff水増し項目と過多チェック項目の整理
333 10:57a 🔵 row-action-gutter-cell の構造的問題発見 — `row-action-bar` が gutter 外に絶対配置されている
334 " 🟣 showReadOnlyTableActions オプション追加 — SCM diff の head 側でも行/列アクションUIを表示可能に
335 10:58a 🟣 showReadOnlyTableActions を SCM diff head 側に自動適用 — extension.ts で条件付き有効化
336 10:59a 🟣 showReadOnlyTableActions のユニットテスト追加 — readOnly SCM head でアクションUI表示・mutation無効を検証
337 " 🔴 showTableActions と diff-side クラス付与の条件を diffReport 存在時に限定
338 " ✅ 全テスト通過確認 — ユニット41件・UIスクリーンショット全件パス
339 11:00a 🔵 scm-head-wide スクリーンショット確認 — readOnly+showReadOnlyTableActions でガター列が表示されることを視覚確認
341 2:02p ✅ TC-SCM-01 step #5 ref label expected values clarified in manual test plan
340 " 🔵 TC-SCM-02 Manual Test — Two Test Case Deficiencies Found
345 " 🔵 vscode-ntf-yaml-editor Git Branch Divergence
346 " 🔵 vscode-ntf-yaml-editor repo has divergent branches with remote
350 " 🔵 Semantic merge resolution strategy confirmed for manual-test-plan.md and ntfYamlEditorWebview.js
342 2:03p 🔴 TC-SCM-02 Manual Test Plan Corrected — Two Deficiencies Fixed
343 " 🔴 Unified View Active Sheet: div → button Element Fix
344 " 🔴 Unified View CSS — Deleted Strikethrough Opacity and Ref Input Visibility Fixed
347 2:07p 🔵 Git .git directory is read-only, blocking all write operations
348 " 🔵 Divergence map: local master ahead 6, behind 1 from origin/master
349 " 🟣 Row action bar refactored to floating overlay layer; showTableActions/allowTableMutation split added
S69 Semantic merge analysis — continued content comparison and commit ancestry investigation for docs/manual-test-plan.md and media/ntfYamlEditorWebview.js (May 26, 10:23 PM)
**Investigated**: Extended the merge analysis with `git show --unified=20 5cb01ff -- docs/manual-test-plan.md` to examine the exact diff of local HEAD's last commit for the conflicting file, and with line-numbered sed reads of both local and remote versions of both files. Checked `git log --oneline -- docs/manual-test-plan.md` for the full commit ancestry of that file.

**Learned**: Critical ancestry finding: `git show 5cb01ff` shows `index 2056434..3f2ec43` for docs/manual-test-plan.md — meaning the "before" state of this commit is 2056434, which is exactly origin/master's (e5f4168's) version of the file. This means local HEAD's test plan changes were applied ON TOP OF origin/master's version of the file, not on top of the divergence base (5817c27). During rebase, this means docs/manual-test-plan.md may NOT produce a genuine conflict — git can likely auto-apply local changes since they started from the remote version.

    In contrast, ntfYamlEditorWebview.js shows `index 8d2aa1a..ba41d22` in local HEAD, where 8d2aa1a is the 5817c27 base version. Local and remote both modified from the same base independently, so ntfYamlEditorWebview.js IS a genuine 3-way conflict.

    The local commit history for manual-test-plan.md shows only two local commits touched it: 6afc342 ("TC-SCM-02 テストケース不備の修正") and 5cb01ff ("レイアウト崩れ修正"). The 5cb01ff diff confirmed: added staged-diff workflow steps, updated C-VIEW-05 label from "base/head" to "HEAD/working tree", renamed TC-CDP-01 to "2 経路", removed TC-CDP-01 step 5 (text editor tab button route), added unified view sidebar note.

**Completed**: Full semantic merge analysis complete. Key conclusion: docs/manual-test-plan.md conflict is likely auto-resolvable during rebase (local was built on remote version); ntfYamlEditorWebview.js requires manual resolution (take local entirely). User has been given all the information needed to execute the rebase on their own terminal.

**Next Steps**: User to execute on their own terminal: `git stash push -- AGENTS.md && git pull --rebase origin master`. If ntfYamlEditorWebview.js conflicts: `git checkout --ours media/ntfYamlEditorWebview.js && git add media/ntfYamlEditorWebview.js && git rebase --continue`. docs/manual-test-plan.md should auto-merge. Then `git stash pop && git push origin master`.


Access 3322k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>

## Project Terminology

Use `docs/glossary.md` as the terminology source of truth when discussing,
refactoring, naming files, or naming code concepts in this project.

In particular:

- `Model`, `Sheet`, `Block`, `Row`, and `Cell` refer to the NTF YAML internal structure.
- `Cell Diff`, `SCM Diff`, `Standalone HTML Report`, and `Normal Editor` are distinct views and must not be conflated.
- `Canonical Form` is the shared output target for converter output, editor save, and CLI format.
