# NTF YAML Editor 用語集

この文書は、NTF YAML Editor で使う用語の基準である。
設計、レビュー、リファクタリング、コード上の命名で同じ意味を使うために置く。

## 機能領域

| 用語 | 意味 |
| --- | --- |
| NTF YAML Core | NTF YAML を読み取り、sheet / block / row / cell として扱える内部表現へ解釈する領域。 |
| NTF YAML Analysis | NTF YAML の構造や参照関係を検査する処理の総称。 |
| Table Editor | `.ntf.yaml` を表として表示・編集する VS Code custom editor の体験。 |
| Webview UI | sheet / block / row / cell を browser 側で描画・操作する UI。 |
| Cell Diff | YAML をテキスト行ではなく、sheet / block / row / cell の単位で比較する差分機能。 |
| Git Diff Context | VS Code の `git://` URI、working tree、index、任意 Git ref から base/head の YAML text を取り出す処理。 |
| Cell Diff Panel | `NTF YAML Editor: NTF データ差分を表示` で開く拡張機能所有の diff panel。左右分割、上下分割、統合表示、ref 編集、HTML export、Export All を扱う。 |
| SCM Diff | VS Code SCM から変更ファイルを開いたときの diff editor 連携。左右ペインは VS Code が管理し、拡張は base/head それぞれの custom editor を描画する。 |
| Standalone HTML Report | VS Code 外で開ける静的 HTML の diff report。 |
| CLI | `ntf-yaml` コマンド。`convert`, `lint`, `format`, `diff` を持つ。 |
| Excel Convert | `.xlsx` / `.xls` 変換を Python tool に委譲し、NTF YAML を出力する CLI 機能。 |

## ドメイン用語

| 用語 | 意味 |
| --- | --- |
| NTF YAML | Nablarch Testing Framework のテストデータを YAML で表現したもの。このプロジェクトは汎用 YAML ではなく NTF YAML を対象にする。 |
| 生 YAML | ファイルに保存されている文字列そのもの。コメント、空行、クォート、並び、インデントなどの表記を含む。 |
| Model | `parseYaml()` が生 YAML から作る内部表現。現状は `{ sheets: [...] }` の形を取り、表示・編集・diff の入力として使う。 |
| Canonical Form | converter output、editor save、CLI format の YAML 表記を揃えるという設計目標を指す言葉。 |
| Sheet | top-level YAML key。NTF Excel の sheet に対応する。 |
| Block | Sheet 配下の名前付きデータ単位。例: `LIST_MAP=...`, `SETUP_TABLE[1]=...`, `EXPECTED_VARIABLE[1]=...`。 |
| Table Block | ファイル系 block 以外の NTF block を、通常の object row の表として扱う表示・編集・diff 経路。 |
| File Rows Block | ファイル定義とファイル内容を row 配列として扱う block。可変長ファイルと固定長ファイルを含む。 |
| Variable File Block | 可変長ファイルを表す file rows block。`SETUP_VARIABLE`, `EXPECTED_VARIABLE` を含む。 |
| Fixed-length File Block | 固定長ファイルを表す file rows block。`SETUP_FIXED`, `EXPECTED_FIXED` を含む。ディレクティブ行以外は可変長ファイルと同じ表構造として扱う。 |
| Raw Block | YAML 形状が通常の表または file rows として扱えない場合の fallback 表示。NTF block 種別の標準分類としては扱わない。 |
| Block の扱い | block を通常 table、file rows、fallback 表示のどの経路に通すかの判断。生 YAML の独立要素ではない。 |
| Row | block 内の 1 行。Table Block では object、File Rows Block では array を基本形にする。 |
| Cell | row と column の交点にある値。 |
| Diagnostic | NTF YAML Analysis が出す warning / error。 |
| Diff Report | base/head の比較結果を file / sheet / block / row / cell にまとめた中間表現。diff 表示の入力になる。 |
| Diff Status | `added`, `deleted`, `changed`, `unchanged` のいずれか。 |

## ビュー用語

| 用語 | 意味 |
| --- | --- |
| Normal Editor | Explorer などから NTF YAML file を単一 custom editor pane として開くビュー。 |
| SCM Diff | VS Code SCM から変更ファイルをクリックしたときに、VS Code が作る左右 diff editor。 |
| Cell Diff | 拡張機能所有の Cell Diff Panel で、2 ペインまたは統合表示として開くビュー。 |
| HTML Report | export された静的 HTML の diff report。 |
