# NTF YAML Editor 手動テスト計画

この文書は、仕様変更後の NTF YAML Editor を人間が確認するための手動テスト計画である。自動テストでは拾いにくい VS Code 上のワークフローと、ビュー種別ごとの表示・編集可否・差分表示を確認する。

## 前提

手動確認の前に自動テストを通す。

```sh
npm test
```

拡張は次の手順で起動する。

1. VS Code で `vscode-ntf-yaml-editor` フォルダを開く。
2. `F5` で Extension Development Host を起動する。
3. Extension Development Host 側で対象 fixture を開く。

編集を伴う確認では scratch copy を使う。

```sh
mkdir -p /tmp/ntf-yaml-manual
cp test/fixtures/manual/*.ntf.yaml /tmp/ntf-yaml-manual/
cp test/fixtures/ntf-samples/*.ntf.yaml /tmp/ntf-yaml-manual/
```

## 確定方針

- `.ntf.yaml` は `NTF YAML Table Editor` で開く。
- 通常エディタは編集可能である。
- SCM diff は base 側を readonly、head 側を編集可能として扱う。
- Cell Diff Panel、HTML report は readonly として扱う。
- scm diff は VS Code の diff editor が左右ペインを管理する。拡張側では分割切り替え UI を出さない。
- Cell Diff Panel と HTML report は 1 webview 内で split / unified 表示を切り替える。
- ファイル指定を持つ `VARIABLE` / `FIXED` 系 block はファイル系 table として扱う。
- `VARIABLE` / `FIXED` 系以外の NTF block は通常 table として扱う。
- prefix ごとの特別な表示区分は作らない。
- 表として扱えない YAML 形状は fallback 表示として扱い、NTF block 種別の標準分類にはしない。

## 洗い出し観点

手動ケースは次の 4 軸の組み合わせで洗い出す。

| 軸 | 分岐 |
| --- | --- |
| ビュー種別 | 通常エディタ / SCM diff / Cell Diff Panel / HTML report |
| 編集可否 | 編集可能 / readonly |
| ブロック種別 | 通常 table / ファイル系 table / fallback 表示 / sheet・block 操作 |
| 差分種別 | セル変更 / 行追加 / 行削除 / block 追加 / block 削除 / sheet 追加 / sheet 削除 / ファイル系 table 差分 / unified before-after |

## 検証観点

- ビュー種別ごとの責務が混ざっていないこと。
- 通常エディタと SCM diff の head 側では編集対象が編集でき、SCM diff の base 側、Cell Diff Panel、HTML report では編集・追加・削除・リネーム系 UI が使えないこと。
- 通常 table、ファイル系 table、fallback 表示がそれぞれ期待する形式で読めること。
- 差分ビューでセル変更、行追加、行削除、block 追加、block 削除、sheet 追加、sheet 削除が読み分けられること。
- SCM diff、Cell Diff Panel、HTML report で差分の意味が矛盾しないこと。

## テストデータ

| Fixture | 用途 |
| --- | --- |
| `test/fixtures/manual/table-ui-current-spec.ntf.yaml` | 通常エディタの通常 table、ファイル系 table、fallback 表示、sheet・block 操作確認 |
| `test/fixtures/manual/rawrows-ui-case.ntf.yaml` | ファイル系 table 単独確認 |
| `test/fixtures/manual/cell-diff-ui-base.ntf.yaml` | table / ファイル系 table の差分確認 base |
| `test/fixtures/manual/cell-diff-ui-head.ntf.yaml` | table / ファイル系 table の差分確認 head |
| `test/fixtures/manual/branch-coverage-diff-base.ntf.yaml` | sheet / block 差分確認 base |
| `test/fixtures/manual/branch-coverage-diff-head.ntf.yaml` | sheet / block 差分確認 head |
| `test/fixtures/ntf-samples/web-project-form.ntf.yaml` | 実データに近い通常 table 確認 |

## ケース一覧

| ID | ビュー種別 | 編集可否 | ブロック種別 | 差分種別 |
| --- | --- | --- | --- | --- |
| MT-01 | 通常エディタ | 編集可能 | 通常 table / ファイル系 table / fallback 表示 | なし |
| MT-02 | 通常エディタ | 編集可能 | 通常 table | なし |
| MT-03 | 通常エディタ | 編集可能 | ファイル系 table | なし |
| MT-04 | 通常エディタ | 編集可能 | fallback 表示 | なし |
| MT-05 | 通常エディタ | 編集可能 | sheet・block 操作 | なし |
| MT-06 | SCM diff | base readonly / head 編集可能 | 通常 table / ファイル系 table | セル変更 / 行追加 / 行削除 / ファイル系 table 差分 |
| MT-07 | SCM diff | base readonly / head 編集可能 | sheet・block | block 追加 / block 削除 / sheet 追加 / sheet 削除 |
| MT-08 | Cell Diff Panel | readonly | 通常 table / ファイル系 table | セル変更 / 行追加 / 行削除 / ファイル系 table 差分 / unified before-after |
| MT-09 | Cell Diff Panel | readonly | sheet・block | block 追加 / block 削除 / sheet 追加 / sheet 削除 |
| MT-10 | HTML report | readonly | 通常 table / ファイル系 table | セル変更 / 行追加 / 行削除 / ファイル系 table 差分 / unified before-after |
| MT-11 | HTML report | readonly | sheet・block | block 追加 / block 削除 / sheet 追加 / sheet 削除 |

## 共通準備

SCM diff、Cell Diff Panel、HTML report は一時 repository を作って確認する。

table / ファイル系 table 差分:

```sh
tmp=/tmp/ntf-yaml-scm-diff-manual
rm -rf "$tmp"
mkdir -p "$tmp"
cp test/fixtures/manual/cell-diff-ui-base.ntf.yaml "$tmp/scenario.ntf.yaml"
cd "$tmp"
git init
git config user.email ntf-yaml@example.test
git config user.name "NTF YAML Test"
git add scenario.ntf.yaml
git commit -m base
cp /home/happy/nablarch/vscode-ntf-yaml-editor/test/fixtures/manual/cell-diff-ui-head.ntf.yaml "$tmp/scenario.ntf.yaml"
code "$tmp"
```

sheet / block 差分:

```sh
tmp=/tmp/ntf-yaml-branch-diff-manual
rm -rf "$tmp"
mkdir -p "$tmp"
cp test/fixtures/manual/branch-coverage-diff-base.ntf.yaml "$tmp/scenario.ntf.yaml"
cd "$tmp"
git init
git config user.email ntf-yaml@example.test
git config user.name "NTF YAML Test"
git add scenario.ntf.yaml
git commit -m base
cp /home/happy/nablarch/vscode-ntf-yaml-editor/test/fixtures/manual/branch-coverage-diff-head.ntf.yaml "$tmp/scenario.ntf.yaml"
code "$tmp"
```

## テストケース

### MT-01 通常エディタで主要ブロックを開く

Fixture: `test/fixtures/manual/table-ui-current-spec.ntf.yaml`

手順:

1. Extension Development Host で fixture を開く。
2. `tableUi` sheet を表示する。
3. `wideTable` sheet に切り替える。

期待結果:

- `NTF YAML Table Editor` が開く。
- sheet list から sheet を切り替えられる。
- 通常 table、ファイル系 table、fallback 表示が表示される。
- blank Webview や script error が出ない。

### MT-02 通常 table を編集できる

Fixture: `/tmp/ntf-yaml-manual/table-ui-current-spec.ntf.yaml`

Sheet: `tableUi`

手順:

1. `LIST_MAP=requestParams` のセル値を 1 つ変更する。
2. 行を追加する。
3. 列を追加する。
4. 既存列名を 1 つ変更する。
5. 行を 1 つ削除する。
6. 列を 1 つ削除する。
7. `Save YAML` を押す。
8. text editor で保存後 YAML を確認する。

期待結果:

- セル変更、行追加、列追加、列名変更、行削除、列削除が保存される。
- 対象外の sheet / block が消えない。

### MT-03 ファイル系 table を編集できる

Fixture: `/tmp/ntf-yaml-manual/table-ui-current-spec.ntf.yaml`

Sheet: `tableUi`

手順:

1. `EXPECTED_VARIABLE=./tmp/result.csv` を表示する。
2. ファイル系 table のセルを 1 つ変更する。
3. 行を追加する。
4. 列を追加する。
5. 行を 1 つ削除する。
6. 列を 1 つ削除する。
7. `Save YAML` を押す。
8. text editor で保存後 YAML を確認する。

期待結果:

- ファイル系 table のセル変更、行追加、列追加、行削除、列削除が保存される。
- 対象外の block が消えない。

### MT-04 fallback 表示を壊さず保持する

Fixture: `/tmp/ntf-yaml-manual/table-ui-current-spec.ntf.yaml`

Sheet: `tableUi`

手順:

1. fallback 表示になる YAML 形状を含む block を表示する。
2. 他の通常 table のセルを 1 つ変更する。
3. `Save YAML` を押す。
4. text editor で保存後 YAML を確認する。

期待結果:

- fallback 表示の内容が消えない。
- `VARIABLE` / `FIXED` 系 block は fallback 表示ではなく、ファイル系 table として表示される。

### MT-05 sheet / block を操作できる

Fixture: `/tmp/ntf-yaml-manual/table-ui-current-spec.ntf.yaml`

手順:

1. `New sheet` から sheet を追加する。
2. 追加 sheet に `LIST_MAP` block を追加する。
3. sheet 名を変更する。
4. block 名を変更する。
5. block を削除する。
6. sheet を削除する。
7. `Save YAML` を押す。
8. text editor で保存後 YAML を確認する。

期待結果:

- sheet と block の追加、リネーム、削除が保存される。
- 操作対象外の sheet / block が消えない。

### MT-06 SCM diff で table / ファイル系 table 差分を読む

Fixture: `cell-diff-ui-base.ntf.yaml` と `cell-diff-ui-head.ntf.yaml`

手順:

1. 共通準備の table / ファイル系 table 差分 repository を Extension Development Host で開く。
2. Source Control view の Changes から `scenario.ntf.yaml` を開く。
3. 左右ペインの `LIST_MAP=requestParams` を確認する。
4. 左右ペインの `EXPECTED_VARIABLE=./tmp/result.csv` を確認する。

期待結果:

- VS Code の diff editor 上で左右ペインが表示される。
- 拡張側の split / unified 切り替え UI は出ない。
- base 側では保存、追加、削除、リネーム系操作は使えない。
- head 側では通常エディタと同じ編集操作が使える。
- 通常 table のセル変更、行追加、行削除が読める。
- ファイル系 table のセル変更、行追加が読める。

### MT-07 SCM diff で sheet / block 差分を読む

Fixture: `branch-coverage-diff-base.ntf.yaml` と `branch-coverage-diff-head.ntf.yaml`

手順:

1. 共通準備の sheet / block 差分 repository を Extension Development Host で開く。
2. Source Control view の Changes から `scenario.ntf.yaml` を開く。
3. 左右ペインで sheet list と各 block を確認する。

期待結果:

- 削除 sheet が base 側で読める。
- 追加 sheet が head 側で読める。
- 削除 block が base 側で読める。
- 追加 block が head 側で読める。
- 変更 block のセル変更が読める。
- base 側では保存、追加、削除、リネーム系操作は使えない。
- head 側では通常エディタと同じ編集操作が使える。

### MT-08 Cell Diff Panel で table / ファイル系 table 差分を読む

Fixture: `cell-diff-ui-base.ntf.yaml` と `cell-diff-ui-head.ntf.yaml`

手順:

1. 共通準備の table / ファイル系 table 差分 repository を Extension Development Host で開く。
2. Source Control view の `scenario.ntf.yaml` を右クリックする。
3. `NTF YAML: Open Cell Diff` を実行する。
4. split 表示で `LIST_MAP=requestParams` と `EXPECTED_VARIABLE=./tmp/result.csv` を確認する。
5. unified 表示に切り替えて同じ block を確認する。

期待結果:

- `NTF YAML Cell Diff` panel が開く。
- split 表示では base/head が readonly table として表示される。
- unified 表示では変更セルの before / after がセル内に表示される。
- 通常 table のセル変更、行追加、行削除が読める。
- ファイル系 table のセル変更、行追加が読める。
- 保存、追加、削除、リネーム系操作は使えない。

### MT-09 Cell Diff Panel で sheet / block 差分を読む

Fixture: `branch-coverage-diff-base.ntf.yaml` と `branch-coverage-diff-head.ntf.yaml`

手順:

1. 共通準備の sheet / block 差分 repository を Extension Development Host で開く。
2. Source Control view の `scenario.ntf.yaml` を右クリックする。
3. `NTF YAML: Open Cell Diff` を実行する。
4. split 表示で sheet list と各 block を確認する。
5. unified 表示に切り替えて各 sheet / block を確認する。

期待結果:

- 削除 sheet、追加 sheet、削除 block、追加 block が読める。
- 変更 block のセル変更が読める。
- split / unified 表示で差分の意味が矛盾しない。
- 保存、追加、削除、リネーム系操作は使えない。

### MT-10 HTML report で table / ファイル系 table 差分を読む

Fixture: `cell-diff-ui-base.ntf.yaml` と `cell-diff-ui-head.ntf.yaml`

手順:

1. MT-08 の Cell Diff Panel を開く。
2. `Export HTML` を実行する。
3. 生成された HTML を開く。
4. split 表示と unified 表示で `LIST_MAP=requestParams` と `EXPECTED_VARIABLE=./tmp/result.csv` を確認する。

期待結果:

- HTML report が開ける。
- 通常 table のセル変更、行追加、行削除が読める。
- ファイル系 table のセル変更、行追加が読める。
- 編集操作は使えない。
- VS Code 専用の `Export HTML` / `Export All` 操作は report 内に出ない。

### MT-11 HTML report で sheet / block 差分を読む

Fixture: `branch-coverage-diff-base.ntf.yaml` と `branch-coverage-diff-head.ntf.yaml`

手順:

1. MT-09 の Cell Diff Panel を開く。
2. `Export HTML` を実行する。
3. 生成された HTML を開く。
4. split 表示と unified 表示で sheet list と各 block を確認する。

期待結果:

- 削除 sheet、追加 sheet、削除 block、追加 block が読める。
- 変更 block のセル変更が読める。
- 編集操作は使えない。
- VS Code 専用の `Export HTML` / `Export All` 操作は report 内に出ない。

## 完了条件

- MT-01 から MT-11 を実行した、または skip 理由を記録した。
- 失敗ケースには fixture、ビュー種別、block、操作、期待結果、実際の結果を記録した。
- UX 懸念を `blocker`、`before broader trial`、`backlog` のいずれかに分類した。
