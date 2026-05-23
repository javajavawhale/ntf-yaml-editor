# ファイル系ブロック表示仕様

この文書は、NTF YAML Editor で可変長ファイルブロックと固定長ファイルブロックの内容をどう表示・編集・差分レビューするかを定義する。

対象は NTF YAML のうち、Excel 由来のファイル定義とファイル内容を表すブロックである。

## 対象ブロック

| 種別 | ブロック | example での確認状況 | 用途 |
| --- | --- | --- | --- |
| 可変長ファイル | `SETUP_VARIABLE` | example に実例あり | 入力可変長ファイル |
| 可変長ファイル | `EXPECTED_VARIABLE` | example に実例あり | 期待可変長ファイル |
| 固定長ファイル | `SETUP_FIXED` | ユーザー確認済み NTF ドメイン知識 | 入力固定長ファイル |
| 固定長ファイル | `EXPECTED_FIXED` | ユーザー確認済み NTF ドメイン知識 | 期待固定長ファイル |

これらはエディタ上では共通の「ファイル系表」として扱う。
固定長ファイルと可変長ファイルの YAML 表構造は、ディレクティブ行以外を同一仕様として扱う。
違いは、NTF 実行時に解釈されるディレクティブ行の値である。
NTF YAML Editor はディレクティブ値のバリデーションを行わないため、エディタ仕様上は同一仕様とみなす。
ただし現段階では、YAML の値・プロパティ・表記をエディタ都合で変換してはならない。
YAML データ仕様は、yaml 化した example リポジトリの `.ntf.yaml` に準拠する。
`#RawRows` のようなコメント表記は、example YAML に現れる表記として扱う。
これは NTF の正式用語として扱わない。
`#FixedLengthFile` も、example YAML に現れる補助コメントとして扱う。
処理分岐はコメント名ではなく、block がファイル系表かどうかで判断する。

## 目的

- Excel のファイル定義表を YAML 上でも表として読めるようにする。
- ファイル定義の変更とデータ値の変更をレビュー時に見分けられるようにする。
- 通常エディタ、SCM diff、Cell Diff Panel、HTML report で同じ意味の表示にする。
- editor save が example 準拠の YAML 表記を壊さないようにする。

## 非目的

- 汎用 YAML の編集体験を提供すること。
- NTF のファイルフォーマットを完全に検証すること。
- 固定長ファイルの実データをバイト幅単位でプレビューすること。

## example 由来の入力 YAML

この節の YAML は、yaml 化した example リポジトリにある `.ntf.yaml` を出典とする。
表記やコメント位置は、エディタ仕様ではなく example の実態として記録する。

### `SETUP_VARIABLE`

出典:

- `samples/nablarch-example-batch/src/test/java/com/nablarch/example/app/batch/action/ImportZipCodeFileActionRequestTest.ntf.yaml`

```yaml
  SETUP_VARIABLE[1]=work/test/importZipCode/importZipCode.csv: #RawRows
    - ["text-encoding", "UTF-8"]
    - ["record-separator", "CRLF"]
    - ["データレコード", "localGovernmentCode", "zipCode5digit", "zipCode7digit", "prefectureKana", "cityKana", "addressKana", "prefectureKanji", "cityKanji", "addressKanji", "multipleZipCodes", "numberedEveryKoaza", "addressWithChome", "multipleAddress", "updateData", "updateDataReason"]
    - ["", "半角", "半角", "半角", "半角", "半角", "半角", "全角", "全角", "全角", "半角", "半角", "半角", "半角", "半角", "半角"]
    - ["", "01101", "060  ", "0600000", "ﾎｯｶｲﾄﾞｳ", "ｻｯﾎﾟﾛｼﾁｭｳｵｳｸ", "ｲｶﾆｹｲｻｲｶﾞﾅｲﾊﾞｱｲ", "北海道", "札幌市中央区", "以下に掲載がない場合", "0", "0", "0", "0", "0", "0"]
```

同じ `SETUP_VARIABLE` でも、コメントがブロック名行の次行に置かれる例がある。
出典:

- `samples/nablarch-example-batch/src/test/java/com/nablarch/example/app/batch/action/ImportZipCodeFileDataFormatActionRequestTest.ntf.yaml`

```yaml
  SETUP_VARIABLE[1]=work/test/importZipCode/importZipCode_by_format.csv:
    #RawRows
    - [ "text-encoding", "UTF-8" ]
    - [ "record-separator", "CRLF" ]
    - [
        "header",
        "recordKbn",
        "localGovernmentCode",
        "zipCode5digit",
        "zipCode7digit",
        "prefectureKana",
        "cityKana",
        "addressKana",
        "prefectureKanji",
        "cityKanji",
        "addressKanji",
      ]
```

### `EXPECTED_VARIABLE`

出典:

- `samples/nablarch-example-web/src/test/java/com/nablarch/example/app/web/action/ProjectActionRequestTest.ntf.yaml`

```yaml
  EXPECTED_VARIABLE=./tmp/html_dump/ProjectActionRequestTest/downloadNormal_Shot1_プロジェクト一覧ダウンロード_プロジェクト一覧.csv: #RawRows
    - ["text-encoding", "Shift_JIS"]
    - ["record-separator", "CRLF"]
    - ["field-separator", ","]
    - ["header", "projectName", "projectType", "projectClass", "projectManager", "projectLeader", "clientId", "clientName", "projectStartDate", "projectEndDate", "note", "sales", "costOfGoodsSold", "sga", "allocationOfCorpExpenses"]
    - ["", "全角漢字", "全角漢字", "全角漢字", "全角漢字", "全角漢字", "全角漢字", "全角漢字", "全角漢字", "全角漢字", "全角漢字", "全角漢字", "全角漢字", "全角漢字", "全角漢字"]
    - ["", "\"プロジェクト名\"", "\"プロジェクト種別\"", "\"プロジェクト分類\"", "\"プロジェクトマネージャー\"", "\"プロジェクトリーダー\"", "\"顧客ID\"", "\"顧客名\"", "\"プロジェクト開始日\"", "\"プロジェクト終了日\"", "\"備考\"", "\"売上高\"", "\"売上原価\"", "\"販管費\"", "\"本社配賦\""]
    - ["data", "projectName", "projectType", "projectClass", "projectManager", "projectLeader", "clientId", "clientName", "projectStartDate", "projectEndDate", "note", "sales", "costOfGoodsSold", "sga", "allocationOfCorpExpenses"]
```

### 固定長ファイル

`SETUP_FIXED` / `EXPECTED_FIXED` は、`SETUP_VARIABLE` / `EXPECTED_VARIABLE` と同じファイル系表として扱う。
ディレクティブ行は固定長ファイル固有の値を持つ。
ディレクティブ行以外の表構造、表示、差分の基本仕様は可変長ファイルと同じである。
エディタはディレクティブ値の妥当性を検証しない。

## 内部表現

エディタ内部では、可変長ファイルと固定長ファイルをどちらも行配列として扱う。
この行配列は表示・差分レビュー用の構造であり、現段階では YAML を再生成するための正規モデルではない。

可変長ファイル:

| 内部 row | 表示上の意味 |
| --- | --- |
| `[ "text-encoding", "UTF-8" ]` | ファイルディレクティブ |
| `[ "header", "id", "city", "memo" ]` | ヘッダ定義 |
| `[ "data", "001", "Tokyo", "base" ]` | データ行 |
| `[ "end" ]` | 終端行 |

固定長ファイルも同じ内部表現を使う。
固定長か可変長かで行配列の形は分けない。

## 表示仕様

### 共通

- ファイル系ブロックは共通のファイル系 table コンポーネントで表示する。
- 列ヘッダには内部キーや列番号を表示しない。
- 固定長ファイルブロックでは、行追加、列追加、行削除、列削除、値編集、並び替えを保存対象にする。
- 固定長ファイルブロックは、可変長ファイルブロックと同じファイル系表として編集できるようにする。
- SCM diff では base 側を readonly、head 側を編集可能にする。
- Cell Diff Panel、HTML report では readonly とする。
- すべてのセルは行番号・列番号ベースで編集対象になる。

### 構造セル

構造セルは、ユーザーがデータ値ではなくファイル定義として読むべきセルである。

構造セルとして扱うもの:

- ファイルディレクティブ名
- `header`、`data`、`end` など、ファイル系表の構造を表す行種別
- フィールド名
- データ型
- 桁数などのフィールド属性

構造セルは通常データセルと違う背景色で表示する。
差分表示時も、構造セルであることが分かる色を維持する。

### ファイル系ブロックの表示

ファイル系ブロックは、YAML の配列行をそのまま表として表示する。
可変長ファイルと固定長ファイルで表示仕様を分けない。

| row 例 | 表示方針 |
| --- | --- |
| `[ "text-encoding", "UTF-8" ]` | 1列目をディレクティブ名として強調する |
| `[ "field-separator", "," ]` | 1列目をディレクティブ名として強調する |
| `[ "header", ... ]` | 行全体をヘッダ定義として強調する |
| `[ "data", ... ]` | 1列目を行種別として強調し、以降をデータセルとして扱う |
| `[ "end" ]` | 終端行として表示する |
| `[ "record-length", "12" ]` | ディレクティブ行として表示する。値の妥当性は検証しない |

`header` の後続セルはフィールド名として読める。
ただし UI 上の列ヘッダには昇格しない。

## 差分仕様

ファイル系ブロックの差分は、行配列をもとにセル単位で比較する。

- 行追加、行削除、行変更を表示する。
- セル変更を表示する。
- 可変長ファイルと固定長ファイルで同じ diff UI を使う。

比較キーの現行方針:

| 種別 | 行の比較 | セルの比較 |
| --- | --- | --- |
| 可変長ファイル | 行配列の LCS | 列位置 |
| 固定長ファイル | 行配列の LCS | 列位置 |

固定長ファイルと可変長ファイルの差分仕様は同じである。

## Serialize 方針

固定長ファイルブロックの serialize は、編集後の行配列を YAML に反映する。
ディレクティブ行以外の表構造は、可変長ファイルブロックと同じファイル系表として扱う。

固定長ファイルブロックで許可するもの:

- sheet の順番変更
- block の順番変更
- 行の順番変更
- 列の順番変更
- セル値の変更
- 行の追加と削除
- 列の追加と削除

許可しないもの:

- コメント位置を変えること
- `#RawRows` / `#FixedLengthFile` の表記を変えること
- 固定長 YAML を別の YAML 形状へ変換すること

可変長ファイルの YAML 例は、example 由来の表記を保持する。

```yaml
  SETUP_VARIABLE[1]=work/test/importZipCode/importZipCode.csv: #RawRows
    - ["text-encoding", "UTF-8"]
    - ["record-separator", "CRLF"]
```

固定長ファイルブロックの保存時は、内部行配列から YAML を再生成する。
再生成形式は可変長ファイルブロックと同じファイル系表形式に揃える。

## 現行実装との差分と注意点

2026-05-17 時点の実装では、固定長ファイルもファイル系 table と同じ表コンポーネントで表示・差分表示する。
ただし通常エディタ上の固定長セルは readonly で、保存時も元 YAML を原文保持している。
これは現行仕様との差分であり、固定長ファイルを編集保存できるように修正する。

## 拡張候補

- `record-length` など固定長向けディレクティブ値の検査。
- 固定長ファイルブロックに対する追加の妥当性検査。

## 関連文書

- `docs/rawrows-diff-spec.md`
- `docs/cell-diff-design.md`
- `docs/manual-test-plan.md`
- `docs/glossary.md`
