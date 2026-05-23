# 構造 Steering

## 構成パターン

このリポジトリは、小さな VS Code 拡張、CLI、NTF YAML の構造解釈を扱う共有ライブラリを中心に構成する。

責務境界を明確に保つ。

- VS Code 連携は `extension.js` に置く。
- 解析、シリアライズ、分析、分類、将来の差分ロジックは `lib/` に置く。
- ブラウザ Webview の描画と操作は `media/` に置く。
- CLI 入口は `bin/` に置く。
- 自動テストは `test/` に置く。
- プロダクト、テスト、設計メモは `docs/` に置く。

## ファイル境界ルール

UI 層に NTF YAML 解析やシリアライズロジックを重複させない。

VS Code と CLI の両方で必要な挙動は、まず共有ライブラリに追加し、その後連携層から呼び出す。

VS Code 固有の挙動は `extension.js` または VS Code 用モジュールに置く。

Webview または HTML レポートの表示専用挙動は、モデル計算から分離して描画コードに置く。

Excel 移行、編集、診断、差分で共有できる NTF YAML の解釈は、個別機能の都合で分岐させない。表の概念と破壊検知の一貫性を優先する。

## 命名パターン

- VS Code コマンド ID は `ntfYaml.*` 接頭辞を使う。
- カスタムエディタの view type は `ntfYaml.*` 名前空間を使う。
- テストファイルは `*.test.js` とする。
- NTF サンプル fixture は `test/fixtures/ntf-samples/` に置く。
- YAML ブロック名は、`LIST_MAP`、`SETUP_TABLE`、`EXPECTED_TABLE`、`SETUP_VARIABLE`、`EXPECTED_VARIABLE` などの NTF データ型名に従う。

## ドキュメントパターン

`docs/` は、長期的に残す設計と検証文脈に使う。

- `docs/test-cases.md` は自動テストの網羅範囲を記述する。
- `docs/manual-test-plan.md` は人間が確認する UX と移行検証を記述する。
- 機能設計メモは簡潔で意思決定中心にし、実装タスクや仕様が存在する場合はそこへつなげる。

## テストデータのパターン

パーサ、シリアライザ、診断、表示挙動の検証では、代表的な NTF サンプル fixture を優先する。

クォート、null sentinel、壊れた構造、単一ブロック挙動などの小さな境界事例には合成例を使ってよい。

## 生成物とローカル成果物

生成されたパッケージ出力、依存フォルダ、`.vscode-test/`、ローカルツール成果物はソース構造として扱わない。明示的なリリースまたはテストワークフローの一部にならない限り、steering には影響させない。
