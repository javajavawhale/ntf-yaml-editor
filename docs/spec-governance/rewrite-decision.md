# リライト判断

作成日: 2026-05-23

## 結論

全面リライトはしない。
現行コードを土台に、仕様判断済みの箇所から focused refactoring で直す。

判断理由:

- 根本課題は、実装方式そのものよりも、固定長ファイル、通常表示、ビュー別編集可否、diff 意味論の判断が曖昧なまま実装されたことである。
- `open-decisions.md` と `refactor-candidates.md` で、先に直すべき P0 / P1 が具体化できている。
- Domain Model 層、Serializer 層、Validation 拡充、View Model 層を先に新設する必要はない。
- 全面リライトは、未検証の仕様判断を新しい API や層構造として固定するリスクが高い。

## 責務別判断

| 対象 | 判断 | 根拠 | 次の作業 |
| --- | --- | --- | --- |
| NTF YAML 解釈 | リファクタで足りる | `VARIABLE` / `FIXED` 系だけをファイル系 table とし、それ以外を通常 table とする判断が確定した。独立 Domain Model 層は作らない。 | R-001, R-003, R-004 |
| 保存 | 置き換えない | Serializer 層は今回作らない。固定長 edit/save の不足を既存保存経路で解消する。 | R-001 |
| 差分 | リファクタで足りる | 通常 table とファイル系 table の比較規則は整理済み。差分エンジン全体を置き換える根拠はない。 | R-003, R-006 |
| 表示 | リファクタで足りる | ビュー間で表コンポーネントと diff 意味を共有し、readonly / editable 判定を整理すればよい。View Model 層は作らない。 | R-002, R-005 |
| NTF YAML Analysis | 今回触らない | ビュー系フローから呼び出さない。CLI lint の既存機能として扱う。 | R-011 |

## focused refactoring task

実装は次の順序で進める。

1. R-001 固定長ファイルブロックを file rows として編集・保存できるようにする。
2. R-002 SCM Diff head を Normal Editor と同じ編集対象として扱う。
3. R-003 block の扱い判定を整理する。
4. R-004 ファイル系以外の NTF block を通常の Table Block として扱う。
5. R-005 view mode / readonly 判定を集約する。

public exports の安定方針:

- 既存の拡張機能 entrypoint と CLI command 名は変更しない。
- 既存 test から参照されている public function は、必要な場合だけ薄い互換 wrapper を残す。
- 内部 helper は、仕様判断済みの責務に沿って小さく移動できる。

実行するテスト:

- 固定長 file rows の parse / edit / save unit test
- 固定長 diff unit test
- ファイル系以外の NTF block の通常 table 表示 test
- SCM Diff base readonly / head editable の e2e または webview test
- 既存 `npm run test:unit`
- 変更範囲に応じて `npm run test:e2e`

## 実装に入る条件

- `open-decisions.md` がユーザー確認済みである。
- `refactor-candidates.md` がユーザー確認済みである。
- 既存ドキュメントから、固定長 raw 表示、SCM Diff 全体 readonly、`RESPONSE_*` 個別特例、固定長専用表モデルの方針が除去されている。
