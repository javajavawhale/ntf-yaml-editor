# 技術 Steering

## 実行環境

- 開発実行環境は Node.js 22 を前提にする。
- VS Code 拡張は VS Code 1.85.0 以上を対象にする。
- 拡張本体は CommonJS モジュールを使う。
- プロジェクトは軽量に保ち、フロントエンドフレームワークは導入しない。

## VS Code 拡張のパターン

NTF YAML の表編集にはカスタムテキストエディタを使う。

- `extension.js` は VS Code 連携、カスタムエディタ登録、Webview HTML 組み立てを担当する。
- Webview はスクリプト有効とし、VS Code メッセージ経由でドキュメント更新を受ける。
- 保存時は、シリアライズした NTF YAML でテキストドキュメント全体を置換し、その後ドキュメントを保存する。
- 明確な VS Code 連携境界が必要な機能でない限り、既存カスタムエディタの形を保つ。

## 共有ライブラリのパターン

`lib/ntfYamlModel.js` は、NTF YAML の構造解釈と保存経路を持つ共有ライブラリである。
独立した Domain Model 層や Serializer 層として扱わない。

- パーサ、保存、ブロックの扱い判定は、Node テストとブラウザ Webview の両方から再利用できるようにする。
- CommonJS と Webview グローバルの両方で動かす必要があるコードは UMD 形式を維持する。
- Excel 移行、ローカル編集、レビュー、差分で同じ構造解釈を使う。
- 汎用 YAML ラウンドトリップよりも、NTF 構造に対する決定的で明示的な解析ルールを優先する。
- NTF YAML で意味のある区別を保持する。特に `~` と `""` は区別する。

## Webview のパターン

`media/ntfYamlEditorWebview.js` はブラウザ側の描画と操作を担当する。

- DOM は plain JavaScript で直接構築する。
- Webview 状態は解析済み NTF YAML モデルデータとして持つ。
- 保存操作ではシリアライズ済み YAML を VS Code へ postMessage する。
- 複雑なナビゲーション補助よりも、単純な操作と安定した表の挙動を優先する。

## CLI のパターン

`bin/ntf-yaml.js` は CLI 入口である。

- コマンドは明示的でスクリプトから利用しやすく保つ。
- 既存コマンド群は convert、lint、format。
- 新しい CLI 挙動は解析ロジックを重複させず、共有ライブラリを再利用する。
- Excel 移行経路では外部変換依存を許容する。ただし、中心となる YAML 構造解釈と差分の挙動はローカルかつ決定的に保つ。

## テスト標準

- 単体テストは Node 標準の `node:test` を使う。
- Webview DOM テストは jsdom を使う。
- VS Code 連携テストは `@vscode/test-electron` を使う。
- モデルと Webview の高速確認には `npm run test:unit` を使う。
- Extension Host の挙動確認には `npm run test:e2e` を使う。
- NTF YAML の境界事例は fixture を使ったテストを優先する。

## パッケージング

VSIX パッケージングはローカル優先とする。

- `npm run package:vsix` はパッケージング前に単体テストを実行する。
- Marketplace 公開は当然のプロダクト経路として扱わない。
