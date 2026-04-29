# NTF YAML Editor PoC

Nablarch NTF 用 YAML を表形式で編集する VS Code 拡張の PoC。

## 使い方

1. VS Code で `vscode-ntf-yaml-editor` フォルダを開く。
2. `F5` で Extension Development Host を起動する。
3. `sample.yaml` を右クリックし、`Open With...` から `NTF YAML Table Editor` を選択する。
4. セルを編集し、`Save YAML` を押す。

## 現在の対応範囲

- トップレベルキーをシートとして表示する。
- シート直下の `LIST_MAP`, `SETUP_TABLE`, `EXPECTED_TABLE` 系ブロックを表形式で編集する。
- 行追加、列追加、YAML 保存に対応する。

コメント保持、固定長/可変長ファイルブロックの専用編集、Excel からの自動移行は未対応。
