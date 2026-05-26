# NTF YAML Editor 手動テスト計画

この文書は、NTF YAML Editor を人間が確認するための手動テスト計画である。ISTQB のベストプラクティスに従い、仕様から導出したテスト条件（Test Conditions）を軸に構成する。

---

## 1. テスト方針

### 1.1 テスト対象

| ビュー | 説明 |
|--------|------|
| 通常エディタ | Explorer で `.ntf.yaml` を開く。`renderHtml`（diffReport なし） |
| SCM diff | SCM パネルでファイルをクリック → VS Code diff editor が左右各1回 `resolveCustomTextEditor` を呼ぶ。左=base（readonly）、右=head（編集可） |
| Cell Diff Panel | `NTF YAML Editor: NTF データ差分を表示` コマンド → 1 webview 内 2 ペイン、split/unified 切り替え付き |
| HTML report | Cell Diff Panel の Export HTML / Export All → スタンドアロン静的 HTML |

### 1.2 テスト対象外

- 自動テストでカバーされるユニット挙動（パース・シリアライズ・diff ロジック）
- VS Code 本体の SCM UI・Git 操作
- パフォーマンス（大規模ファイル）
- CLI サブコマンド（`ntf-yaml lint / format / convert`）

### 1.3 優先度基準

| 優先度 | 基準 |
|--------|------|
| P1 | 主要機能が壊れると利用不能になる。リリース前に必ず確認する |
| P2 | 品質に影響するが代替手段がある。余裕があれば確認する |
| P3 | 改善的。次サイクル以降でよい |

### 1.4 完了条件

- P1 ケース（15件）を全て実行し、PASS / FAIL / SKIP を記録した
- FAIL ケースには現象・再現手順・期待結果・実際の結果を記録した
- UX 懸念を `blocker` / `before-broader-trial` / `backlog` に分類した

---

## 2. テスト基盤（Test Basis）

### ブロック種別

| 種別 | ブロック名プレフィックス | 表示形式 |
|------|----------------------|---------|
| Table Block | `LIST_MAP` / `SETUP_TABLE` / `EXPECTED_TABLE` / `EXPECTED_COMPLETE_TABLE` | key-value 行テーブル |
| RawRows Block | `SETUP_VARIABLE` / `EXPECTED_VARIABLE` / `SETUP_FIXED` / `EXPECTED_FIXED` | 配列テーブル |
| Fallback | 上記以外、または上記だが配列形式でない YAML 内容 | raw テキスト表示 |

---

## 3. テスト条件（Test Conditions）

仕様から導出した原子的条件。各テストケースはカバーする条件を明示する。

### C-EDIT（編集可否）

| ID | 条件 |
|----|------|
| C-EDIT-01 | 通常エディタは編集可能（Save YAML・Add Sheet・行/列/block/sheet 操作 UI が表示される） |
| C-EDIT-02 | SCM diff base 側は readonly（Save YAML・行/列操作 UI が非表示） |
| C-EDIT-03 | SCM diff head 側は編集可能（通常エディタと同じ操作 UI） |
| C-EDIT-04 | Cell Diff Panel は readonly |
| C-EDIT-05 | HTML report は readonly |

### C-BLOCK（ブロック表示）

| ID | 条件 |
|----|------|
| C-BLOCK-01 | Table Block は key-value 行テーブルとして表示される |
| C-BLOCK-02 | RawRows Block は配列テーブルとして表示される |
| C-BLOCK-03 | Fallback ブロックは raw テキストとして表示される |

### C-DIFF（差分表示）

| ID | 条件 |
|----|------|
| C-DIFF-01 | セル変更は changed（黄）ハイライトで表示される |
| C-DIFF-02 | 行追加は added（緑）ハイライトで表示される |
| C-DIFF-03 | 行削除は deleted（赤）ハイライトで表示される（base 側に残る） |
| C-DIFF-04 | block 追加は added ハイライト、block 削除は deleted ハイライトで表示される |
| C-DIFF-05 | sheet 追加は added ハイライト、sheet 削除は deleted ハイライトで表示される |
| C-DIFF-06 | RawRows Block の差分は added / changed / deleted ハイライトで表示される |
| C-DIFF-07 | unified 表示でセル変更は before 打ち消し線 + after 強調表示（緑）で表示される |

### C-VIEW（ビュー固有）

| ID | 条件 |
|----|------|
| C-VIEW-01 | SCM diff は VS Code diff フレームワークが左右ペインを管理し、拡張側に split 切り替え UI は出ない |
| C-VIEW-02 | Cell Diff Panel は 1 webview 内で横 split / 縦 split / unified を切り替えられる |
| C-VIEW-03 | HTML report は横 split / 縦 split / unified を切り替えられる |
| C-VIEW-04 | スタンドアロン HTML report に Export HTML / Export All ボタンは存在しない |
| C-VIEW-05 | split 表示で base / head のラベルが正しく表示される |

### C-OP（操作 → 保存反映）

| ID | 条件 |
|----|------|
| C-OP-01 | セル値編集（null sentinel `~` 保持含む）→ 保存で YAML に反映される |
| C-OP-02 | 行追加・削除 → 保存で YAML に反映される |
| C-OP-03 | 列追加・削除・リネーム → 保存で YAML に反映される |
| C-OP-04 | 行ドラッグ並び替え → 保存で YAML に反映される |
| C-OP-05 | 列ドラッグ並び替え → 保存で YAML に反映される |
| C-OP-06 | block 追加・削除・リネーム → 保存で YAML に反映される |
| C-OP-07 | block ドラッグ並び替え → 保存で YAML に反映される |
| C-OP-08 | sheet 追加・削除・リネーム → 保存で YAML に反映される |
| C-OP-09 | sheet ドラッグ並び替え → 保存で YAML に反映される |

---

## 4. テスト環境

### 4.1 前提

手動確認の前に自動テストを通す。

```sh
npm test
```

拡張は次の手順で起動する。

1. VS Code で `vscode-ntf-yaml-editor` フォルダを開く。
2. `F5` で Extension Development Host を起動する。
3. Extension Development Host 側で対象 fixture を開く。

### 4.2 テストデータ一覧

| Fixture | 用途 | 主な要素 |
|---------|------|---------|
| `test/fixtures/manual/editor-comprehensive.ntf.yaml` | 通常エディタ確認（参照専用） | Table Block × 3、RawRows Block × 3（VARIABLE × 2 / FIXED × 1）、2 シート |
| `test/fixtures/manual/diff-all-base.ntf.yaml` | 差分確認 base | changedSheet（変更行・削除行・削除 block）、deletedSheet、stableSheet |
| `test/fixtures/manual/diff-all-head.ntf.yaml` | 差分確認 head | addedSheet、changedSheet（変更行・追加行・追加 block）、stableSheet |
| `test/fixtures/ntf-samples/web-project-form.ntf.yaml` | 実データ参照 | 列数・行数の多い LIST_MAP、日本語列名 |

### 4.3 セットアップ

**scratch copy（TC-NE-02〜06 用）**

```sh
mkdir -p /tmp/ntf-yaml-manual
cp test/fixtures/manual/editor-comprehensive.ntf.yaml /tmp/ntf-yaml-manual/
```

**差分確認 repository（TC-SCM / TC-CDP / TC-HTML 用）**

既に起動済みの Extension Development Host で `vscode-ntf-yaml-editor` repository を開いている前提で、この repository の working tree を一時的に汚して差分を作る。新しい `code` は起動しない。

```sh
cd /home/happy/nablarch/vscode-ntf-yaml-editor
cp test/fixtures/manual/diff-all-head.ntf.yaml test/fixtures/manual/diff-all-base.ntf.yaml
```

これにより、Git の `HEAD` 側は `diff-all-base.ntf.yaml` の base 内容、working tree 側は `diff-all-head.ntf.yaml` の head 内容になる。Extension Development Host は既存ウィンドウのまま、SCM diff・Cell Diff Panel・HTML report の各ケースを実施する。

ステージ済み差分の SCM diff を確認する場合は、上記の差分作成後に対象ファイルを stage する。

```sh
cd /home/happy/nablarch/vscode-ntf-yaml-editor
git add test/fixtures/manual/diff-all-base.ntf.yaml
```

この場合、Git の `HEAD` 側は base 内容、index 側は head 内容になる。SCM パネルでは `Changes` ではなく `Staged Changes` から対象ファイルを開く。

確認後は次のコマンドで戻す。

```sh
cd /home/happy/nablarch/vscode-ntf-yaml-editor
git restore --staged test/fixtures/manual/diff-all-base.ntf.yaml
git restore test/fixtures/manual/diff-all-base.ntf.yaml
```

---

## 5. テストケース

ステップごとに「操作」と「期待結果」を記す。失敗時は行番号と実際の結果を記録すること。

---

### 5.1 通常エディタ（TC-NE）

---

#### TC-NE-01　起動・全ブロック種別表示・sheet 切り替え

**優先度**: P1　**カバー条件**: C-BLOCK-01, C-BLOCK-02

**Fixture**: `test/fixtures/manual/editor-comprehensive.ntf.yaml`（Extension Development Host で直接開く）

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | fixture を Explorer で開く | `NTF YAML Table Editor` タブが開く。スクリプトエラーや blank webview が出ない |
| 2 | sidebar の sheet list を確認する | `tableUi`・`wideTable` の 2 シートが表示される |
| 3 | `tableUi` sheet を選択する | `LIST_MAP=requestParams`（Table Block）・`SETUP_TABLE=PROJECT`・`EXPECTED_TABLE=PROJECT` が key-value 行テーブルとして表示される（C-BLOCK-01） |
| 4 | `EXPECTED_VARIABLE=./tmp/result.csv` を確認する | 配列テーブル（ディレクティブ行、`header` / `data` のレコード種別行、データ型行、データ行）として表示される。ディレクティブ行以外の先頭列は補助セルとして表示される（C-BLOCK-02） |
| 5 | `EXPECTED_FIXED[1]=./tmp/fixed.dat` を確認する | 配列テーブル（ディレクティブ行、レコード種別行、データ型行、フィールド長行、データ行）として表示される。ディレクティブ行以外の先頭列は補助セルとして表示される（C-BLOCK-02） |
| 6 | sidebar で `wideTable` sheet をクリックする | `LIST_MAP=wideRows` が 11 列のテーブルとして表示される。`日本語列` が正しく表示される。横スクロールバーの左端がテーブルの左端と揃う |

---

#### TC-NE-02　Table Block 編集・保存

**優先度**: P1　**カバー条件**: C-EDIT-01, C-OP-01, C-OP-02, C-OP-03

**Fixture**: `/tmp/ntf-yaml-manual/editor-comprehensive.ntf.yaml`（scratch copy）

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | scratch copy を Extension Development Host で開く | `NTF YAML Table Editor` が開く。`Save YAML`・`Add Sheet` ボタンが表示される（C-EDIT-01） |
| 2 | `LIST_MAP=requestParams` の `"[no]": "1"` 行の `name` セルをクリックして値を変更する | セルが編集モードになり、変更値が反映される |
| 3 | `"[no]": "2"` 行の `value` セルをクリックして `abc` に変更する | `abc` が表示される |
| 4 | `abc` を削除して空文字にし、`Save YAML` を押す | — |
| 5 | text editor で YAML を確認する | 変更が YAML に反映されている（C-OP-01） |
| 6 | 行追加ボタンをクリックする | 末尾に空行が追加される |
| 7 | `"[no]": "1"` 行の削除ボタンをクリックする | 行が消える |
| 8 | `Save YAML` を押して YAML を確認する | 追加・削除が YAML に反映されている。他の block・sheet は変わっていない（C-OP-02） |
| 9 | 列追加ボタンをクリックする | 右端に空列が追加される |
| 10 | 列ヘッダをクリックしてリネームする | 列名が変わる |
| 11 | その列の削除ボタンをクリックする | 列が消える |
| 12 | `Save YAML` を押して YAML を確認する | 列操作が YAML に反映されている（C-OP-03） |

---

#### TC-NE-03　RawRows Block 編集・保存

**優先度**: P1　**カバー条件**: C-BLOCK-02, C-OP-01, C-OP-02, C-OP-03

**Fixture**: `/tmp/ntf-yaml-manual/editor-comprehensive.ntf.yaml`（scratch copy）

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | `EXPECTED_VARIABLE=./tmp/result.csv` の `data` 行のセルをクリックして値を変更する | セルが編集モードになり、変更値が反映される（C-BLOCK-02） |
| 2 | `header` 行の `memo` セルを `~` に変更する | `~` が表示される |
| 3 | `Save YAML` を押して YAML を確認する | 変更が `[ ... ]` 配列形式で保存されている。`~` は null sentinel として保存される（C-OP-01） |
| 4 | 行追加ボタンをクリックする | 配列行が末尾に追加される |
| 5 | 追加した行の削除ボタンをクリックする | 行が消える |
| 6 | 列追加・列削除を実施する | 配列の幅が変わる |
| 7 | `Save YAML` を押して YAML を確認する | 行・列操作が YAML の配列形式に反映されている（C-OP-02, C-OP-03） |

---

#### TC-NE-04　ドラッグ並び替え・保存

**優先度**: P2　**カバー条件**: C-OP-04, C-OP-05, C-OP-07, C-OP-09

**Fixture**: `/tmp/ntf-yaml-manual/editor-comprehensive.ntf.yaml`（scratch copy）

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | `LIST_MAP=requestParams` の 2 行目をドラッグして 1 行目と入れ替える | 行順が入れ替わる |
| 2 | `Save YAML` を押して YAML を確認する | YAML 内の行順が変わっている（C-OP-04） |
| 3 | `name` 列ヘッダをドラッグして `value` の左に移動する | 列順が変わる |
| 4 | `Save YAML` を押して YAML を確認する | YAML 内の列順が変わっている（C-OP-05） |
| 5 | `SETUP_TABLE=PROJECT` block をドラッグして `LIST_MAP=requestParams` の上に移動する | block 順が変わる |
| 6 | `Save YAML` を押して YAML を確認する | YAML 内の block 順が変わっている（C-OP-07） |
| 7 | sidebar で `wideTable` を `tableUi` の上にドラッグする | sheet 順が変わる |
| 8 | `Save YAML` を押して YAML を確認する | YAML 内の sheet 順が変わっている（C-OP-09） |

---

#### TC-NE-05　block / sheet 追加・削除・リネーム・保存

**優先度**: P1　**カバー条件**: C-OP-06, C-OP-08

**Fixture**: `/tmp/ntf-yaml-manual/editor-comprehensive.ntf.yaml`（scratch copy）

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | block 追加ドロップダウンから `LIST_MAP` を選んで追加する | 新しい `LIST_MAP=` block が末尾に追加される |
| 2 | block 名をリネームする（例: `LIST_MAP=newBlock`） | block 名が変わる |
| 3 | `Save YAML` を押して YAML を確認する | 新 block が YAML に存在する（C-OP-06） |
| 4 | 追加した block の削除ボタンをクリックする | block が消える |
| 5 | `Save YAML` を押して YAML を確認する | 削除した block が YAML から消えている。他 block は変わっていない（C-OP-06） |
| 6 | `Add Sheet` ボタンをクリックして新 sheet を追加する | 新 sheet が sidebar に追加される |
| 7 | 新 sheet 名をリネームする | sheet 名が変わる |
| 8 | `Save YAML` を押して YAML を確認する | 新 sheet が YAML に存在する（C-OP-08） |
| 9 | 新 sheet の削除ボタン（×）をクリックする | sheet が消える |
| 10 | `Save YAML` を押して YAML を確認する | 削除した sheet が YAML から消えている。他 sheet は変わっていない（C-OP-08） |

---

#### TC-NE-06　外部ファイル変更による webview 自動更新

**優先度**: P2　**カバー条件**: C-EDIT-01

**Fixture**: `/tmp/ntf-yaml-manual/editor-comprehensive.ntf.yaml`（scratch copy）

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | scratch copy を Extension Development Host で開く | `NTF YAML Table Editor` が開く |
| 2 | 別ターミナルまたはテキストエディタで scratch copy を直接編集して保存する（例: `name` の値を変更） | webview が自動更新され、変更値が反映される |
| 3 | VS Code のテキストエディタで保存した場合も同様に確認する | webview が更新される |

---

### 5.2 SCM diff（TC-SCM）

事前に「**4.3 セットアップ：差分確認 repository**」を実施し、Extension Development Host でこの repository を開いておく。

---

#### TC-SCM-01　diff editor 起動・左右ペイン確認

**優先度**: P1　**カバー条件**: C-VIEW-01, C-EDIT-02, C-EDIT-03, C-VIEW-05

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | SCM パネルの Changes から `test/fixtures/manual/diff-all-base.ntf.yaml` をクリックする | VS Code の diff editor が開き、左右ペインに `NTF YAML Table Editor` が表示される |
| 2 | 拡張側 UI に split / unified 切り替えボタンが**ない**ことを確認する | split 切り替え UI は出ない（C-VIEW-01） |
| 3 | 左ペイン（base）を確認する | `Save YAML`・行追加・列追加などの編集 UI が表示されない（C-EDIT-02） |
| 4 | 右ペイン（head）を確認する | `Save YAML`・行追加・列追加などの編集 UI が表示される（C-EDIT-03） |
| 5 | 左ペインの上部ラベルと右ペインの上部ラベルを確認する | 左ペインは `HEAD`、右ペインは `working tree` と表示される（C-VIEW-05） |

ステージ済み差分も確認する場合は、4.3 のステージ済み差分手順を実施してから次を確認する。

| # | 操作 | 期待結果 |
|---|------|---------|
| 6 | SCM パネルの `Staged Changes` から `test/fixtures/manual/diff-all-base.ntf.yaml` をクリックする | VS Code の diff editor が開き、左右ペインに `NTF YAML Table Editor` が表示される |
| 7 | 左ペインの上部ラベルと右ペインの上部ラベルを確認する | 左ペインは `HEAD`、右ペインは `index` と表示される（C-VIEW-05） |

---

#### TC-SCM-02　Table / RawRows 差分ハイライト確認

**優先度**: P1　**カバー条件**: C-DIFF-01, C-DIFF-02, C-DIFF-03, C-DIFF-06, C-BLOCK-01, C-BLOCK-02

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | 右ペインの `changedSheet` → `LIST_MAP=requestParams` を確認する | `"[no]": "1"` 行の `name` セルが changed（黄）ハイライトされている（C-DIFF-01） |
| 2 | 右ペインで `"[no]": "4"` 行を確認する | 行全体が added（緑）ハイライトで表示される（C-DIFF-02） |
| 3 | 左ペインで `"[no]": "2"` 行（`delete me`）を確認する | deleted（赤）ハイライトで表示される（C-DIFF-03） |
| 4 | 右ペインの `EXPECTED_VARIABLE=./tmp/result.csv` を確認する | 変更行（001/Kyoto・003/Nara）と追加行（004/NewCity）が changed / added ハイライトで表示される（C-DIFF-06, C-BLOCK-02） |
| 5 | 右ペインの `EXPECTED_TABLE=STABLE_BLOCK` ブロックを確認する | key-value 行テーブル表示（C-BLOCK-01） |
| 6 | 左ペインの `SETUP_TABLE=DELETED_BLOCK`・右ペインの `EXPECTED_TABLE=ADDED_BLOCK` ブロックを確認する | key-value 行テーブル表示（C-BLOCK-01） |

---

#### TC-SCM-03　block / sheet 追加・削除ハイライト確認

**優先度**: P2　**カバー条件**: C-DIFF-04, C-DIFF-05

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | 右ペインで `EXPECTED_TABLE=ADDED_BLOCK` を確認する | added（緑）ハイライトで表示される（C-DIFF-04） |
| 2 | 左ペインで `SETUP_TABLE=DELETED_BLOCK` を確認する | deleted（赤）ハイライトで表示される（C-DIFF-04） |
| 3 | 右ペインの sheet list で `addedSheet` を確認する | added ハイライトで表示される（C-DIFF-05） |
| 4 | 左ペインの sheet list で `deletedSheet` を確認する | deleted ハイライトで表示される（C-DIFF-05） |
| 5 | 左右ペインの `stableSheet` を確認する | ハイライトなし（unchanged）で表示される |

---

#### TC-SCM-04　head 側で編集・保存・差分更新確認

**優先度**: P1　**カバー条件**: C-EDIT-03, C-OP-01

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | 右ペインの `changedSheet` → `LIST_MAP=requestParams` の `"[no]": "1"` の `status` セルを変更する | セルが編集モードになり値を変更できる（C-EDIT-03） |
| 2 | `Save YAML` を押す | 保存フィードバックが表示される |
| 3 | 変更後、セルのハイライト状態を確認する | changed セルのハイライトが更新される、または保存内容が diff に反映される（C-OP-01） |

---

### 5.3 Cell Diff Panel（TC-CDP）

事前に「**4.3 セットアップ：差分確認 repository**」を実施しておく。

---

#### TC-CDP-01　2 経路からのパネル起動確認

**優先度**: P1　**カバー条件**: —

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | SCM パネルの `test/fixtures/manual/diff-all-base.ntf.yaml` を右クリック → `NTF YAML Editor: NTF データ差分を表示` を実行する | `NTF YAML Cell Diff` パネルが開く |
| 2 | パネルを閉じる | — |
| 3 | Explorer で `test/fixtures/manual/diff-all-base.ntf.yaml` を右クリック → `NTF YAML Editor: NTF データ差分を表示` を実行する | パネルが開く |
| 4 | パネルを閉じる | — |

---

#### TC-CDP-02　split 表示で全差分種別一覧確認

**優先度**: P1　**カバー条件**: C-DIFF-01〜06, C-BLOCK-01, C-BLOCK-02, C-VIEW-05

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | TC-CDP-01 でパネルを開き、split 横方向表示になっていることを確認する | 左（base）・右（head）の 2 ペインが横並びで表示される |
| 2 | 左右ペインの上部ラベルを確認する | 左ペインは `HEAD`、右ペインは `working tree` と読める状態で表示される（C-VIEW-05） |
| 3 | 右ペインの `changedSheet` → `LIST_MAP=requestParams` を確認する | `"[no]": "1"` の `name` セルが changed（黄）ハイライト（C-DIFF-01） |
| 4 | 右ペインで `"[no]": "4"` 行を確認する | added（緑）ハイライト（C-DIFF-02） |
| 5 | 左ペインで `"[no]": "2"` 行を確認する | deleted（赤）ハイライト（C-DIFF-03） |
| 6 | `EXPECTED_TABLE=ADDED_BLOCK` / `SETUP_TABLE=DELETED_BLOCK` を確認する | added / deleted ハイライト（C-DIFF-04） |
| 7 | sheet list の `addedSheet` / `deletedSheet` を確認する | added / deleted ハイライト（C-DIFF-05） |
| 8 | `EXPECTED_VARIABLE=./tmp/result.csv` を確認する | 配列テーブル形式で差分がハイライト（C-DIFF-06, C-BLOCK-02） |
| 9 | `LIST_MAP=requestParams` が key-value 行テーブルで表示されていることを確認する | Table Block 表示（C-BLOCK-01） |

---

#### TC-CDP-03　unified 表示での before/after 確認

**優先度**: P1　**カバー条件**: C-DIFF-07, C-VIEW-02

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | パネル上部の unified 表示ボタンをクリックする | unified ペインに切り替わる。sidebar の sheet list は通常の sheet 項目として表示され、編集用 input 風にはならない（C-VIEW-02） |
| 2 | `LIST_MAP=requestParams` の `"[no]": "1"` 行の `name` セルを確認する | before 値が打ち消し線付きで表示され、after 値が緑の強調表示で表示される（C-DIFF-07） |
| 3 | 追加行・削除行を確認する | added / deleted ハイライトで表示される |

---

#### TC-CDP-04　split ↔ unified 切り替え（状態遷移）

**優先度**: P1　**カバー条件**: C-VIEW-02

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | パネルが split 横方向の状態から、縦 split ボタンをクリックする | 2 ペインが縦並びに切り替わる（C-VIEW-02） |
| 2 | unified ボタンをクリックする | unified 表示に切り替わる |
| 3 | split 横方向ボタンをクリックする | 横 split に戻る |
| 4 | 各状態でコンテンツ（差分ハイライト）が崩れていないことを確認する | 表示が壊れない |

---

#### TC-CDP-05　readonly 確認

**優先度**: P1　**カバー条件**: C-EDIT-04

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | split 表示の左右ペインで `Save YAML`・`Add Sheet` ボタンを探す | 表示されない（C-EDIT-04） |
| 2 | 任意のセルをクリックして編集を試みる | 編集モードにならない |
| 3 | 行追加・列追加ボタンを探す | 表示されない |
| 4 | unified 表示に切り替えて同様に確認する | 編集 UI が出ない |

---

#### TC-CDP-06　ref 変更

**優先度**: P2　**カバー条件**: —

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | パネルの base ref 入力欄に別の commit SHA や ref を入力して確定する | 差分が再計算され、パネルが更新される |
| 2 | 存在しない ref を入力する | エラーメッセージが表示され、パネルは破綻しない |

---

#### TC-CDP-07　ファイル保存による自動更新

**優先度**: P2　**カバー条件**: —

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | Cell Diff Panel を開いた状態で、VS Code のテキストエディタで `test/fixtures/manual/diff-all-base.ntf.yaml`（working tree）を編集して保存する | Cell Diff Panel の diff が自動更新される |
| 2 | `NTF YAML Table Editor` の head 側で編集して `Save YAML` を押す | Cell Diff Panel の diff が自動更新される |

---

#### TC-CDP-08　Export HTML（単体）+ Export All

**優先度**: P1　**カバー条件**: C-VIEW-04

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | パネルの `Export HTML` ボタンをクリックし、保存先を選んで保存する | HTML ファイルが保存される（C-VIEW-04） |
| 2 | 生成された HTML ファイルをブラウザで開く | TC-HTML-01〜03 を実施する前提となる HTML が確認できる |
| 3 | `Export All` ボタンをクリックし、出力先フォルダを選んで保存する | 変更ファイル数分の HTML が保存される |

---

### 5.4 HTML Report（TC-HTML）

TC-CDP-08 で生成したスタンドアロン HTML を使用する。ブラウザで開いて確認する。

---

#### TC-HTML-01　split ↔ unified 切り替え + 全差分種別確認

**優先度**: P1　**カバー条件**: C-VIEW-03, C-DIFF-01〜07

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | HTML をブラウザで開く | 差分が表示される。split 横方向がデフォルト表示 |
| 2 | `LIST_MAP=requestParams` の changed セルを確認する | changed（黄）ハイライト（C-DIFF-01） |
| 3 | 追加行・削除行を確認する | added / deleted ハイライト（C-DIFF-02, C-DIFF-03） |
| 4 | `EXPECTED_TABLE=ADDED_BLOCK` / `SETUP_TABLE=DELETED_BLOCK` を確認する | added / deleted ハイライト（C-DIFF-04） |
| 5 | sheet の added / deleted を確認する | ハイライト表示（C-DIFF-05） |
| 6 | `EXPECTED_VARIABLE=./tmp/result.csv` の差分を確認する | 配列形式の diff が表示される（C-DIFF-06） |
| 7 | 縦 split ボタンをクリックする | 縦 split に切り替わる（C-VIEW-03） |
| 8 | unified ボタンをクリックする | unified 表示に切り替わる |
| 9 | changed セルの before 打ち消し + after 強調を確認する | 正しく表示される（C-DIFF-07） |
| 10 | 横 split ボタンに戻す | 表示が壊れていない（C-VIEW-03） |

---

#### TC-HTML-02　readonly 確認

**優先度**: P1　**カバー条件**: C-EDIT-05

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | HTML の左右ペインで `Save YAML`・`Add Sheet` ボタンを探す | 表示されない（C-EDIT-05） |
| 2 | セルをクリックして編集を試みる | 編集モードにならない |

---

#### TC-HTML-03　VS Code 固有 UI の非表示確認

**優先度**: P1　**カバー条件**: C-VIEW-04（逆）

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | HTML 内に `Export HTML`・`Export All` ボタンが存在しないことを確認する | ボタンが見当たらない（C-VIEW-04） |
| 2 | ページソースを開いて `exportHtml` / `exportAllHtml` を検索する | 存在しない |

---

## 6. カバレッジマトリクス

全 29 テスト条件とケースの対応。

| 条件 | TC-NE | TC-SCM | TC-CDP | TC-HTML |
|------|-------|--------|--------|---------|
| C-EDIT-01 | NE-01, NE-02, NE-03, NE-04, NE-05 | — | — | — |
| C-EDIT-02 | — | SCM-01 | — | — |
| C-EDIT-03 | — | SCM-01, SCM-04 | — | — |
| C-EDIT-04 | — | — | CDP-05 | — |
| C-EDIT-05 | — | — | — | HTML-02 |
| C-BLOCK-01 | NE-01, NE-02 | SCM-02 | CDP-02 | HTML-01 |
| C-BLOCK-02 | NE-01, NE-03 | SCM-02 | CDP-02 | HTML-01 |
| C-BLOCK-03 | — | — | — | — |
| C-DIFF-01 | — | SCM-02 | CDP-02, CDP-03 | HTML-01 |
| C-DIFF-02 | — | SCM-02 | CDP-02 | HTML-01 |
| C-DIFF-03 | — | SCM-02 | CDP-02 | HTML-01 |
| C-DIFF-04 | — | SCM-03 | CDP-02 | HTML-01 |
| C-DIFF-05 | — | SCM-03 | CDP-02 | HTML-01 |
| C-DIFF-06 | — | SCM-02 | CDP-02 | HTML-01 |
| C-DIFF-07 | — | — | CDP-03 | HTML-01 |
| C-VIEW-01 | — | SCM-01 | — | — |
| C-VIEW-02 | — | — | CDP-03, CDP-04 | — |
| C-VIEW-03 | — | — | — | HTML-01 |
| C-VIEW-04 | — | — | CDP-08 | HTML-03 |
| C-VIEW-05 | — | SCM-01 | CDP-02 | — |
| C-OP-01 | NE-02, NE-03 | SCM-04 | — | — |
| C-OP-02 | NE-02, NE-03 | — | — | — |
| C-OP-03 | NE-02, NE-03 | — | — | — |
| C-OP-04 | NE-04 | — | — | — |
| C-OP-05 | NE-04 | — | — | — |
| C-OP-06 | NE-05 | — | — | — |
| C-OP-07 | NE-04 | — | — | — |
| C-OP-08 | NE-05 | — | — | — |
| C-OP-09 | NE-04 | — | — | — |

---

## 7. 欠陥記録テンプレート

| 項目 | 内容 |
|------|------|
| **ケース ID** | TC-XX-XX |
| **再現手順** | ステップ番号と操作内容 |
| **期待結果** | ケース記載の期待結果 |
| **実際の結果** | 実際に起きたこと（スクリーンショット推奨） |
| **深刻度** | `blocker` / `before-broader-trial` / `backlog` |
| **環境** | OS・VS Code バージョン・拡張バージョン |
