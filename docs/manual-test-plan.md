# NTF YAML Editor 手動テスト計画

この文書は、現行実装の UI と保存動作を人間が確認するための最小限の手動テスト計画である。parser、serializer、CLI、Webview DOM の細かい分岐は自動テストで確認し、ここでは見た目、操作感、VS Code 上のワークフロー、保存後 YAML のレビュー可能性に絞る。

## 前提

手動確認の前に自動テストを通す。

```sh
npm test
```

CLI は今回の手動テストケースのスコープ外とする。CLI の lint / diff / report 生成は自動テストの前提品質として扱い、手動ケースでは掘らない。

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

## 現行仕様

- `.ntf.yaml` は `NTF YAML Table Editor` で開く。
- 通常エディタは編集可能で、SCM diff、Cell Diff Panel、HTML report は readonly として扱う。
- 編集可能テーブルの行・列操作 UI は、表のダミー行列ではなく、ヘッダまたは先頭セルの外側に overlay 表示する。
- 列操作アイコンは列ヘッダの上外側に表示し、セル hover でも該当列だけ表示する。
- 行操作アイコンは行の先頭セルの左外側に縦並びで表示する。
- セルをクリックまたは focus した後は、そのセルの行・列アイコンだけを保持し、他セル hover で追加表示しない。
- readonly テーブルでは操作アイコンを表示しない。hover 時は行左端と列上端のガイドだけを表示し、セル本体の hover ハイライトは出さない。
- RawRows は列番号を表示しない。欠損セル filler は RawRows 表示整形用であり、操作 UI 用のダミー列ではない。
- unified diff は readonly の 1 枚表示で、変更セルは before / after をセル内に表示する。
- `SETUP_FIXED` / `EXPECTED_FIXED` は現行実装では raw block として保持する。

## テストデータ

| Fixture | 用途 |
| --- | --- |
| `test/fixtures/manual/table-ui-current-spec.ntf.yaml` | 通常エディタの table UI、保存、RawRows、raw block の確認 |
| `test/fixtures/manual/rawrows-ui-case.ntf.yaml` | RawRows の小さい確認 |
| `test/fixtures/manual/cell-diff-ui-base.ntf.yaml` | SCM diff / Cell Diff 用 base |
| `test/fixtures/manual/cell-diff-ui-head.ntf.yaml` | SCM diff / Cell Diff 用 head |
| `test/fixtures/ntf-samples/web-project-form.ntf.yaml` | 実データに近い横長 table の確認 |

## 観点

### 通常エディタ

対象ブロック:

- `LIST_MAP`
- `SETUP_TABLE` / `EXPECTED_TABLE`
- `SETUP_VARIABLE` / `EXPECTED_VARIABLE`
- raw block

確認する状態:

- sheet navigation
- カード表示、テーブル表示、RawRows 表示、raw block 保持
- 列ヘッダ hover、セル hover、行 hover、セル click/focus 後の表示固定
- カード背景、余白、外向きアイコン、見切れ、横長表のスクロール
- セル編集、行列操作、RawRows 行列操作、sheet/block 操作、保存後 YAML

### SCM diff

対象ブロック:

- 通常 table
- RawRows

確認する状態:

- VS Code 管理の左右ペインで readonly table が表示される
- 拡張側の分割 UI は出ない
- 保存、追加、削除、リネーム系操作が出ない
- hover は行左端と列上端のガイドだけ出る
- 変更行、変更セル、追加行、削除行が読める

### Cell Diff Panel

対象ブロック:

- 通常 table
- RawRows

確認する状態:

- split 表示、縦分割、unified 表示を切り替えられる
- readonly table として表示される
- unified の before / after 文字サイズが通常セルと同等に見える
- 変更行、変更セル、追加行、削除行、RawRows 変更が読める

### HTML report

対象ブロック:

- 通常 table
- RawRows

確認する状態:

- Cell Diff Panel と同等の split / unified 表示が読める
- 編集操作は出ない
- VS Code 専用の export 操作は出ない

## 合格基準

- 対象ファイルを `NTF YAML Table Editor` で開ける。
- 現行仕様に反する操作アイコン、hover、focus、readonly 表示がない。
- RawRows と raw block が黙って壊れない。
- 編集内容を保存でき、保存後 YAML の差分が説明可能である。
- SCM diff、Cell Diff Panel、HTML report の readonly / diff 表示が矛盾しない。

不具合を見つけた場合は、fixture、sheet、block、操作、期待結果、実際の結果、保存後 YAML 差分の有無を記録する。

## テストケース

### MT-01 通常エディタを開く

Fixture: `test/fixtures/manual/table-ui-current-spec.ntf.yaml`

手順:

1. Extension Development Host で fixture を開く。
2. sheet list と最初の sheet のカードを確認する。
3. `wideTable` sheet に切り替える。

期待結果:

- `NTF YAML Table Editor` が開く。
- sheet list から sheet を切り替えられる。
- `LIST_MAP`、`SETUP_TABLE`、`EXPECTED_TABLE`、RawRows、raw block がそれぞれ表示される。
- blank Webview や script error が出ない。

### MT-02 編集可能 table の hover / focus UI

Fixture: `test/fixtures/manual/table-ui-current-spec.ntf.yaml`

Sheet: `tableUi`

手順:

1. `LIST_MAP=requestParams` の列ヘッダに hover する。
2. 同じ table の任意セルに hover する。
3. 行の任意セルに hover する。
4. 1つのセルをクリックして focus する。
5. focus したまま別セルに hover する。

期待結果:

- 列ヘッダ hover で列操作アイコンが列ヘッダ上外側に表示される。
- セル hover で該当列だけ列操作アイコンが表示される。
- 行 hover で行操作アイコンが先頭セルの左外側に縦並びで表示される。
- アイコンは表の内側にダミー列/行として表示されない。
- アイコンは見切れず、列アイコンは左右中央寄せされる。
- セル click/focus 後はクリックセルの行・列アイコンだけが残り、別セル hover で追加表示されない。

### MT-03 カードと横長 table のレイアウト

Fixture: `test/fixtures/manual/table-ui-current-spec.ntf.yaml`

Sheet: `wideTable`

手順:

1. `LIST_MAP=wideRows` を表示する。
2. 横スクロールする。
3. 列ヘッダとセルに hover する。

期待結果:

- カード上部と表領域の背景に不自然な分断がない。
- 入力項目と表の間の余白が他カードと揃って見える。
- 横スクロールしても列アイコンと行アイコンが表の外側に表示され、見切れない。
- 列ヘッダは読める。

### MT-04 table の編集と保存

Fixture: `/tmp/ntf-yaml-manual/table-ui-current-spec.ntf.yaml`

Sheet: `tableUi`

手順:

1. `LIST_MAP=requestParams` のセル値を1つ編集する。
2. `Add Row` を押し、新しい行に値を入力する。
3. `Add Column` を押し、追加された列の値を入力する。
4. 既存列名を1つ変更する。
5. 行操作アイコンから行を1つ削除する。
6. 列操作アイコンから列を1つ削除する。
7. `Save YAML` を押す。
8. text editor で保存後 YAML を確認する。

期待結果:

- 編集、行追加、列追加、列名変更、行削除、列削除が保存される。
- `"[no]"`、空文字、`~`、日本語列名が意図せず壊れない。
- 保存後の差分が操作内容に対応して説明可能である。

### MT-05 RawRows の表示、操作、保存

Fixture: `/tmp/ntf-yaml-manual/table-ui-current-spec.ntf.yaml`

Sheet: `tableUi`

手順:

1. `EXPECTED_VARIABLE=./tmp/result.csv` を表示する。
2. メタデータ行、複数レコード種別、データ行、欠損セルを確認する。
3. RawRows のセルを1つ編集する。
4. `Add Row` と `Add Column` を使う。
5. 行操作アイコンと列操作アイコンで削除する。
6. `Save YAML` を押し、text editor で確認する。

期待結果:

- RawRows の列番号は表示されない。
- 構造セルとデータセルが視覚的に区別できる。
- 欠損セル filler は操作 UI 用のダミー列に見えない。
- RawRows の編集と行列操作が YAML に保存される。

### MT-06 raw block の保持

Fixture: `/tmp/ntf-yaml-manual/table-ui-current-spec.ntf.yaml`

Sheet: `tableUi`

手順:

1. `EXPECTED_FIXED[1]=./tmp/fixed.dat` を確認する。
2. 何も編集せず `Save YAML` を押す。
3. text editor で保存後 YAML を確認する。

期待結果:

- `EXPECTED_FIXED` は raw block として表示される。
- 保存しても raw content が黙って消えない。

### MT-07 sheet / block 操作

Fixture: `/tmp/ntf-yaml-manual/table-ui-current-spec.ntf.yaml`

手順:

1. `New sheet` から sheet を追加する。
2. 追加 sheet に `LIST_MAP` block を追加する。
3. sheet 名と block 名を変更する。
4. block を削除する。
5. sheet を削除する。
6. `Save YAML` を押し、text editor で確認する。

期待結果:

- sheet と block の追加、リネーム、削除が保存される。
- 操作対象外の sheet / block が消えない。

### MT-08 save only 差分

Fixture: `test/fixtures/manual/table-ui-current-spec.ntf.yaml`

手順:

1. fixture を `/tmp/ntf-yaml-manual/original.ntf.yaml` と `/tmp/ntf-yaml-manual/save-only.ntf.yaml` に copy する。
2. `save-only.ntf.yaml` を開く。
3. 何も編集せず `Save YAML` を押す。
4. 差分を確認する。

```sh
diff -u /tmp/ntf-yaml-manual/original.ntf.yaml /tmp/ntf-yaml-manual/save-only.ntf.yaml
```

期待結果:

- diff がない、または canonical form として説明可能な差分だけである。
- NTF に必要な sheet / block / row / cell が失われない。

### MT-09 SCM diff の readonly table

Fixture: `test/fixtures/manual/cell-diff-ui-base.ntf.yaml` と `test/fixtures/manual/cell-diff-ui-head.ntf.yaml`

準備:

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

手順:

1. Extension Development Host で `$tmp` を開く。
2. Source Control view の Changes から `scenario.ntf.yaml` を開く。
3. 左右ペインの table を確認する。
4. readonly セルに hover する。

期待結果:

- VS Code の diff editor 上で左右ペインが表示される。
- 拡張側の横/縦/1枚表示ボタンは出ない。
- 保存、追加、削除、リネーム系操作は出ない。
- hover では行左端と列上端のガイドだけが出る。
- セル本体の hover ハイライトは出ない。
- 変更行、変更セル、追加行、削除行が読める。

### MT-10 Cell Diff Panel の split / unified

Fixture: `MT-09` の一時 repository

手順:

1. Source Control view の `scenario.ntf.yaml` を右クリックする。
2. `NTF YAML: Open Cell Diff` を実行する。
3. 横分割、縦分割、1枚表示を切り替える。
4. unified 表示で変更セルを見る。
5. RawRows の変更を見る。

期待結果:

- 専用 `NTF YAML Cell Diff` panel が開く。
- split 表示では base/head が readonly table として表示される。
- unified 表示では before / after がセル内に表示される。
- before / after の文字サイズが他セルより不自然に小さく見えない。
- 変更行、変更セル、追加行、削除行、RawRows 変更が読める。
- 操作アイコンは出ない。

### MT-11 HTML report の readonly 表示

Fixture: `MT-09` の一時 repository

手順:

1. `NTF YAML: Open Cell Diff` panel を開く。
2. `Export HTML` を実行する。
3. 生成された HTML を開く。
4. split / unified 表示を確認する。

期待結果:

- HTML report が開ける。
- Cell Diff Panel と同じ意味で差分が読める。
- 編集操作は出ない。
- VS Code 専用の `Export HTML` / `Export All` 操作は report 内に出ない。

## 完了条件

- MT-01 から MT-11 を実行した、または skip 理由を記録した。
- 失敗ケースには再現手順がある。
- UX 懸念を `blocker`、`before broader trial`、`backlog` のいずれかに分類した。
