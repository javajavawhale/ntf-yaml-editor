# readme

// TODO: 暫定版

## これはなに

NTFでテストデータをyamlにしていい感じに開発できるようにすることを目指す、javajavawhaleの個人プロジェクトです。

- yamlテストデータの閲覧・編集を支援するVSCode拡張：PoC実装済
- Excelテストデータをyaml化するマイグレーションスクリプト：未実装
- 静的解析等のCLIツールチェイン：未実装

yamlのフォーマットは、[yaml化したnablarch公式のサンプルリポジトリ](https://github.com/javajavawhale/nablarch-example-batch-ntf-yaml)に準じます。

## 導入方法

//TODO: vsix配布・導入手順

## 背景

[Nablarch Testing Framework](https://nablarch.github.io/docs/LATEST/doc/development_tools/testing_framework/index.html)では、テストデータをExcelファイルに記載しますが、AIコーディングエージェントが普及してきた昨今、AIフレンドリーなフォーマット（yamlとします）への移行の機運が高まっています。一方、yamlでは人間の担当者向けの可読性が落ちます。

このVSCode拡張では、yamlのテストデータの閲覧・編集を支援する機能を提供することで、

- Excelのメリット：人間が直感的にテストデータを操作・確認できる
- yamlのメリット：AIコーディングエージェントが扱いやすい

の両立を目指します。

## 機能概要

### yamlテストデータエディタ

#### エディタの開き方

デフォルトで
	閲覧
	編集

2つのバージョンのテストデータの差分表示
	VSCodeのソース管理、エクスプローラーから表示します
	htmlとしてレポートを書き出せます。レビュープロセスの中で、修正の証跡とする用途を想定しています


