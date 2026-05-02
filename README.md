# NTF YAML Editor PoC

Nablarch NTF 用 YAML を表形式で編集する VS Code 拡張の PoC。

## 前提

- Node.js 22 系で確認。
- VS Code 1.85.0 以上。
- 初回の E2E テストでは `@vscode/test-electron` が `.vscode-test/` にテスト用 VS Code を取得する。

## 使い方

1. VS Code で `vscode-ntf-yaml-editor` フォルダを開く。
2. `F5` で Extension Development Host を起動する。
3. `sample.yaml` などの YAML ファイルを通常どおり開く。
4. セルを編集し、`Save YAML` を押す。

`.yaml` は既定で `NTF YAML Table Editor` として開く。YAML を通常のテキストエディタで開いている場合は、補助経路として `NTF YAML: Open as Table` を実行する。

## CLI ツールチェイン

この PoC は VS Code エディタだけでなく、Excel から YAML へ移行し、変換後の YAML を静的解析する CLI も含む。

`xlsx` を YAML に変換する。

```sh
node ./bin/ntf-yaml.js convert path/to/TestData.xlsx -o path/to/TestData.yaml
```

旧形式の `xls` も同じ入口で変換する。

```sh
node ./bin/ntf-yaml.js convert path/to/TestData.xls -o path/to/TestData.yaml
```

変換直後に lint まで実行する。

```sh
node ./bin/ntf-yaml.js convert path/to/TestData.xlsx -o path/to/TestData.yaml --lint
```

既存 YAML を静的解析する。

```sh
node ./bin/ntf-yaml.js lint path/to/TestData.yaml
```

YAML を共通モデル経由で再整形する。

```sh
node ./bin/ntf-yaml.js format --write path/to/TestData.yaml
```

`xls` 変換は Python の `xlrd` を利用する。環境に `xlrd` がない場合は先にインストールする。
単体テストで実 `.xls` fixture 生成まで確認する場合は Python の `xlwt` も必要。

## 現在の対応範囲

- トップレベルキーをシートとして表示する。
- シート直下の `LIST_MAP`, `SETUP_TABLE`, `EXPECTED_TABLE` 系ブロックを表形式で編集する。
- `SETUP_VARIABLE`, `EXPECTED_VARIABLE` 系ブロックを RawRows 表として表示・編集する。
- 行追加、列追加、YAML 保存に対応する。
- `"[no]"` のような YAML 上で注意が必要なキーを保存時にクォートする。
- `~` と `""` を区別する。
- Problems に NTF YAML の静的解析結果を表示する。
- CLI から `xlsx` / `xls` を YAML に変換する。
- CLI から `lint` / `format` を実行する。

コメント保持、固定長ファイルブロックの専用編集、Excel への逆変換は未対応。

## 開発

依存関係を入れる。

```sh
npm install
```

単体テストのみ実行する。

```sh
npm run test:unit
```

VS Code Extension Host を使う E2E テストのみ実行する。

```sh
npm run test:e2e
```

単体テストと E2E テストをまとめて実行する。

```sh
npm test
```

WSL や sandbox 環境では Electron 起動に制限がかかる場合がある。その場合は sandbox 外で `npm run test:e2e` または `npm test` を実行する。

## 配布

当面は Marketplace 公開ではなく、VSIX ファイルで配布する。

VSIX を作成する。

```sh
npm run package:vsix
```

出力先:

```text
dist/ntf-yaml-editor-0.0.1.vsix
```

配布先の VS Code でインストールする。

```sh
code --install-extension dist/ntf-yaml-editor-0.0.1.vsix
```

Windows 側の VS Code に入れる場合は、生成された `.vsix` を Windows から参照できる場所に置き、VS Code の `Extensions: Install from VSIX...` から選択してもよい。

Marketplace 公開へ進める場合は、次を追加で決める。

- 正式な publisher ID
- README の利用者向け整備
- LICENSE
- CHANGELOG
- アイコン
- バージョン運用

## テスト観点

詳細は `docs/test-cases.md` を参照。
