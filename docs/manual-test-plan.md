# NTF YAML Editor 手動テスト計画

この文書は、NTF YAML Editor PoC を人間が手で確認するためのテストケースを定義する。

自動テストでは、parser、serializer、CLI、Webview DOM 操作、VS Code 拡張としての基本経路を確認する。手動テストでは、人間の判断が必要な観点、つまり可読性、編集しやすさ、ナビゲーション、保存後 YAML の差分がレビュー可能かを確認する。

## スコープ

手動テストでは、次を確認する。

- NTF の保守者が raw YAML より速くテストデータを理解できるか。
- よくある編集を、NTF YAML の構造を壊さずに実施できるか。
- 代表的な sheet や横に広い table が実用に耐えるか。
- diagnostics が役に立つ指摘になっているか、うるさすぎないか。
- 保存後の YAML diff がコードレビュー可能な粒度か。

parser の細かい edge case を手動で網羅する必要はない。それは自動テストで担保する。

## 前提

先に自動テストを通す。

```sh
npm test
```

拡張を起動する。

1. VS Code で `vscode-ntf-yaml-editor` フォルダを開く。
2. `F5` で Extension Development Host を起動する。
3. Extension Development Host 側で `test/fixtures/ntf-samples/` 配下のファイルを開く。

fixture を編集する場合は、直接編集せず scratch copy を使う。

```sh
mkdir -p /tmp/ntf-yaml-manual
cp test/fixtures/ntf-samples/*.yaml /tmp/ntf-yaml-manual/
```

その後、Extension Development Host 側で `/tmp/ntf-yaml-manual/` を開く。

## 全体の注意事項

- `.yaml` は通常 open で `NTF YAML Table Editor` が起動する前提で確認する。
- 各ケースで「開く」と書いてある場合、特に指定がなければ Explorer から通常どおり開く。
- `Open With...` は通常手順では使わない。明示的な補助経路を確認するケースでだけ使う。

## テストデータ

vendoring 済みの fixture を使う。

| Fixture | 目的 |
| --- | --- |
| `test/fixtures/ntf-samples/web-project-action-request.yaml` | Web action request の代表データ。`LIST_MAP`、`EXPECTED_VARIABLE`、`"[no]"`、日本語を含む |
| `test/fixtures/ntf-samples/web-project-bulk-action-request.yaml` | Web action データ。DB setup、null sentinel 行、複数行 request params を含む |
| `test/fixtures/ntf-samples/batch-import-zip-code-data-format-action-request.yaml` | Batch request データ。`SETUP_VARIABLE`、大きい RawRows、block comment の別配置を含む |
| `test/fixtures/ntf-samples/rest-project-action.yaml` | REST action データ。日本語 sheet 名、setup/expected DB table を含む |
| `test/fixtures/ntf-samples/web-project-form.yaml` | Form validation データ。日本語列名が多い横長の `LIST_MAP` を含む |

## 合格基準

手動テストは次を満たせば合格とする。

- ファイルを `NTF YAML Table Editor` で開ける。
- 複数 sheet の navigation が理解できる。
- 編集可能 block が安定した table として表示される。
- RawRows が行/セルの table として表示される。
- 未対応 block が raw text として表示され、黙って消えない。
- 編集内容を保存でき、YAML 上で確認できる。
- 意図しない保存で、破壊的または説明不能な差分が出ない。
- Problems diagnostics が有用な指摘になっている。

使い勝手の問題を見つけた場合は、次を記録する。

- fixture 名
- sheet 名
- block 名
- 操作
- 期待結果
- 実際の結果
- 保存後 YAML がレビュー可能に見えるか

## テストケース

### MT-01 `.yaml` を通常 open して Table Editor が起動すること

Fixture: `web-project-action-request.yaml`

手順:

1. Explorer で fixture をクリックして通常どおり開く。

期待結果:

- `NTF YAML Table Editor` が自動で開く。
- 左ペインに sheet 名が表示される。
- メインペインに最初の sheet の内容が表示される。
- blank Webview や script error が出ない。

### MT-02 明示コマンドで Table Editor を開く補助経路

INFO: 通常のtext editorとして開くことができないのでこのケースは不要

Fixture: `web-project-action-request.yaml`

手順:

1. 何らかの方法で fixture を通常の text editor として開く。例: Command Palette の `Reopen Editor With...` から built-in text editor を選ぶ。
2. Command Palette から `NTF YAML: Open as Table` を実行する。

期待結果:

- 同じファイルが `NTF YAML Table Editor` で開く。
- active editor が table editor になる。
- 無関係な別ファイルは開かれない。

### MT-03 sheet navigation

Fixture: `web-project-action-request.yaml`

手順:

1. fixture を `NTF YAML Table Editor` で開く。
2. `confirmOfCreateNormal` を選択する。
3. `downloadNormal` を選択する。
4. `confirmOfCreateNormal` へ戻る。

期待結果:

- sheet button が読める。
- 目的の sheet を選択できる。
- sheet 切り替えが手作業に耐える速度で動く。
- 選択中 sheet が視覚的に分かる。
- メインペインが選択 sheet の内容に更新される。

人間が判断すること:

- sheet list に検索、filter、grouping、keyboard navigation が必要か。

### MT-04 ListMap の可読性

Fixture: `web-project-action-request.yaml`

Sheet: `confirmOfCreateNormal`

Block:

- `LIST_MAP=testShots`
- `LIST_MAP=requestParams`

手順:

1. 対象 sheet を開く。
2. 両方の block を確認する。
3. 必要なら横スクロールする。

期待結果:

- `LIST_MAP=testShots` が raw YAML より見通しやすい。
- `LIST_MAP=requestParams` の `"[no]"` が通常の編集可能列として表示される。
- 日本語や `form.projectName` のような dotted key が読める。

人間が判断すること:

- 列幅、table 密度、sticky header が必要か。

### MT-05 table cell を編集して保存する

Fixture: `web-project-action-request.yaml` の scratch copy

Sheet: `confirmOfCreateNormal`

Block: `LIST_MAP=requestParams`

手順:

1. 見えている cell を1つ変更する。例: `form.projectName` の値。
2. `Save YAML` をクリックする。
3. ファイルを text として開き直す。
4. 変更後の値を検索する。

期待結果:

- 編集した値が YAML に存在する。
- `"[no]"` は quoted のまま残る。
- 周辺 block が認識可能な形で残る。

追加確認:

```sh
node ./bin/ntf-yaml.js lint /tmp/ntf-yaml-manual/web-project-action-request.yaml
```

期待結果:

- 編集によって新しい error が増えない。

### MT-06 行を追加する

Fixture: `web-project-bulk-action-request.yaml` の scratch copy

対象: 小さめの `LIST_MAP=requestParams` block

手順:

1. `Add Row` をクリックする。
2. 新しい行に簡単な値を入力する。
3. `Save YAML` をクリックする。
4. text として開き直し、追加行を確認する。

期待結果:

- 既存行と同じ列構成で行が追加される。
- 空 cell は `""` として serialize される。
- 既存行が予期せず並び替わらない。

人間が判断すること:

- 末尾追加だけで足りるか。
- insert-before や delete-row が必要か。

### MT-07 列を追加する

Fixture: `web-project-bulk-action-request.yaml` の scratch copy

対象: 小さめの `LIST_MAP=requestParams` block

手順:

1. Add Column の input に新しい列名を入力する。
2. `Add Column` をクリックする。
3. 新しい列の1行に値を入力する。
4. `Save YAML` をクリックする。
5. text として開き直し、対象 block を確認する。

期待結果:

- 新しい列が table に表示される。
- 既存行にも新しい列が追加される。
- 入力した値が正しく serialize される。

人間が判断すること:

- 列追加時に全行へ列を足す挙動が NTF データ編集として自然か。

### MT-08 列名を変更する

Fixture: `web-project-form.yaml` の scratch copy

対象: 日本語列名を含む `LIST_MAP` block

手順:

1. column header を1つ編集する。
2. header から focus を外す。
3. table が新しい列名で再描画されることを確認する。
4. `Save YAML` をクリックする。
5. text として開き直し、値が新しい key の下に残っていることを確認する。

期待結果:

- 値が新しい key の下に保持される。
- その block から旧 key が消える。
- 日本語列名が読める。

注意するリスク:

- 列名変更は破壊的操作になり得る。確認 dialog や undo が必要かを判断する。

### MT-09 null sentinel を保持する

Fixture: `web-project-bulk-action-request.yaml` の scratch copy

Sheet: `setUpDb`

Block: `SETUP_TABLE=PROJECT`

手順:

1. 対象 block を開く。
2. 多くの cell が空表示になっていることを確認する。
3. それらの cell は編集せず `Save YAML` をクリックする。
4. text として開き直す。

期待結果:

- 既存の `~` cell は `~` のまま残る。
- `""` cell がある場合は `""` のまま残る。
- NTF setup data として有効な形を保つ。

### MT-10 RawRows の可読性と編集

Fixture: `batch-import-zip-code-data-format-action-request.yaml` の scratch copy

Block: `SETUP_VARIABLE[1]=work/test/importZipCode/importZipCode_by_format.csv`

手順:

1. 対象 block を含む sheet を開く。
2. RawRows 表示を確認する。
3. RawRows の cell を1つ編集する。
4. `Save YAML` をクリックする。
5. text として開き直し、inline array の行を確認する。

期待結果:

- RawRows が行/セルの table として表示される。
- 編集した cell が保存される。
- comma、日本語、empty/null cell が理解できる形で残る。

人間が判断すること:

- RawRows に列 label、固定幅表示、CSV preview、copy/paste support が必要か。

### MT-12 Form validation の横長 table

Fixture: `web-project-form.yaml`

Sheet:

- `testCharsetAndLength`
- `testSingleValidation`

手順:

1. 各 sheet を開く。
2. 横長の validation table を確認する。
3. 横スクロールする。
4. scratch copy 上で非重要な値を1つ編集して保存する。

期待結果:

- 横長 table が実用に耐える。
- 日本語 validation column が読める。
- 横スクロールが混乱しない。

人間が判断すること:

- sticky first column、sticky header、より密な styling が必要か。

### MT-13 Problems diagnostics

scratch file に以下を作る。

```yaml
case1:
  LIST_MAP=testShots: #ListMap
    - no: "1"
      setUpTable: "1"
```

手順:

1. `/tmp/ntf-yaml-manual/diagnostics.yaml` として保存する。
2. VS Code で開く。
3. Problems panel を開く。

期待結果:

- `description` 不足の error が表示される。
- `SETUP_TABLE[1]=...` 不足の warning が表示される。
- メッセージが NTF 保守者に理解できる。

### MT-14 未対応 block の保持

scratch file に以下を作る。

```yaml
case1:
  EXPECTED_FIXED[1]=./tmp/fixed.txt: #FixedLengthFile
    text-encoding: "ms932"
    ヘッダレコード:
      - [one, 半角数字, "1"]: "1"
```

手順:

1. `NTF YAML Table Editor` で開く。
2. block が raw text として表示されることを確認する。
3. `Save YAML` をクリックする。
4. text として開き直す。

期待結果:

- 未対応 block が黙って消えない。
- raw content が認識可能な形で残る。

### MT-15 意図しない編集なしで保存する

Fixture: `web-project-action-request.yaml` の scratch copy

手順:

1. fixture を `/tmp/ntf-yaml-manual/original.yaml` に copy する。
2. さらに `/tmp/ntf-yaml-manual/save-only.yaml` に copy する。
3. `save-only.yaml` を `NTF YAML Table Editor` で開く。
4. 何も編集せず `Save YAML` をクリックする。
5. 差分を確認する。

   ```sh
   diff -u /tmp/ntf-yaml-manual/original.yaml /tmp/ntf-yaml-manual/save-only.yaml
   ```

期待結果:

- diff が説明可能である。
- NTF に必要な block が失われない。
- quote の変化は、発生する場合でも一貫したルールで説明できる。

人間が判断すること:

- diff がコードレビューに大きすぎる場合、どの formatting change が問題か記録する。

### MT-16 CLI と editor diagnostics の一貫性

Fixture: `web-project-action-request.yaml` の scratch copy

手順:

1. CLI lint を実行する。

   ```sh
   node ./bin/ntf-yaml.js lint /tmp/ntf-yaml-manual/web-project-action-request.yaml
   ```

2. 同じファイルを VS Code で開く。
3. CLI output と Problems を比較する。

期待結果:

- error/warning count が一致する。
- 同じ issue だと分かる程度に message が一致している。

## 完了条件

次を満たしたら手動テスト完了とする。

- MT-01 から MT-18 までを実行した、または skip 理由を明記した。
- 失敗 case には再現手順がある。
- UX 懸念を次のいずれかに分類した。
  - PoC review の blocker
  - broader trial 前に直すべき
  - backlog
- 最終結果を project notes または PR description に要約した。
