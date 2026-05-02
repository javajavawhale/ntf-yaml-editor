# NTF YAML Editor テストケース

手動で確認する UX 観点のテストケースは `docs/manual-test-plan.md` に記載する。

## 自動テストの網羅範囲

実行方法:

```sh
npm test
```

### Unit Tests

`npm run test:unit` で確認する。

- `LIST_MAP`、`SETUP_TABLE`、`EXPECTED_TABLE`、`SETUP_VARIABLE`、`EXPECTED_VARIABLE` の block 分類。
- table row と、`"[no]"` のような quote が必要な特殊 key の parse。
- YAML が key を別の意味に解釈しないよう、特殊 key を quote して serialize すること。
- 空 table column 定義で使う YAML null sentinel cell、つまり `~` の保持。
- 空文字 `""` と YAML null `~` の区別。
- row がない空 table block の保持。
- 日本語、長文、comma、quote、backslash を含む table cell の保持。
- `SETUP_VARIABLE` / `EXPECTED_VARIABLE` の RawRows block の parse と serialize。
- 未対応の fixed-length block を raw text として保持すること。
- `test/fixtures/ntf-samples/` 配下の vendoring 済み NTF sample fixture を読み込み、web、batch、REST、form YAML の主要 editor target を確認すること。
- よくある構造問題の解析。具体的には、`testShots` 必須 column 不足、番号付き参照 block 不足、RawRows の row 幅不一致。
- CLI lint の exit code。error があれば non-zero、warning のみなら zero。
- CLI convert の `xlsx` 動作。テスト内で生成した workbook fixture を YAML に変換し、そのまま lint する。
- CLI convert の `xls` dispatch。`.xls` input が `xlrd` ベースの converter に渡ること。
- 実 `.xls` の CLI convert。Python `xlwt` が利用できる場合、生成した BIFF `.xls` fixture を `xlrd` converter で変換し、そのまま lint する。

### Webview DOM Tests

`npm run test:unit` で jsdom を使って確認する。

- sheet button の描画と active sheet の切り替え。
- table cell の編集と、保存 message 経由で serialized YAML が送られること。
- table row の追加。
- button click と Enter key による table column の追加。
- cell value を保持したまま table column 名を変更すること。
- RawRows cell の編集と、`~` null sentinel の保持。
- document update message を受けた再描画。active sheet が残っている場合は維持し、消えた場合は fallback すること。
- 未対応 block を raw text として表示すること。

### E2E Tests

`npm run test:e2e` で `@vscode/test-electron` を使って確認する。

- 実際の VS Code Extension Host を、この extension を読み込んだ状態で起動する。
- `local.ntf-yaml-editor` を activate できること。
- `ntfYaml.openAsTable` command が登録されていること。
- 生成された Webview HTML に、table editor control と RawRows rendering code が含まれること。
- YAML file を通常 open したときに `ntfYaml.editor` custom editor で開けること。
- 明示的な補助経路として、active text editor から `NTF YAML: Open as Table` で table editor を開けること。
- 不正な `LIST_MAP=testShots` block に対して VS Code Problems diagnostics を出せること。
- vendoring 済み sample fixture を extension save path で round-trip し、重要な YAML 形状が壊れないこと。
- 移行済み web fixture を round-trip し、`~` null sentinel row が保持されること。

E2E runner は `.vscode-test/` 配下にテスト用 VS Code build を取得する。この環境では、VS Code/Electron の起動に filesystem/network sandbox 外での実行が必要になる場合がある。

## 手動 Smoke Checklist

自動テストが通った後に使う簡易確認。

詳細な手動テストは `docs/manual-test-plan.md` を使う。

1. `test/fixtures/ntf-samples/web-project-action-request.yaml` を通常どおり開き、`NTF YAML Table Editor` が自動で起動することを確認する。
2. `confirmOfCreateNormal` を選択する。
3. `LIST_MAP=testShots` と `LIST_MAP=requestParams` が table として表示されることを確認する。
4. `"[no]"` column が通常の編集可能 column として表示されることを確認する。
5. `EXPECTED_VARIABLE` を含む sheet を選び、row/cell table として表示されることを確認する。
6. 編集せず保存し、`npm test` がまだ通ることを確認する。
7. 最終確認として、必要に応じて sample repository 側の関連 Maven test を実行する。

## CLI Smoke Checklist

1. `xlsx` file を変換する。

   ```sh
   node ./bin/ntf-yaml.js convert path/to/TestData.xlsx -o /tmp/TestData.yaml --lint
   ```

2. 旧形式の `xls` file を変換する。

   ```sh
   node ./bin/ntf-yaml.js convert path/to/TestData.xls -o /tmp/TestData.yaml --lint
   ```

3. 生成された YAML を VS Code で開き、Problems が CLI lint と同じ diagnostics を表示することを確認する。
