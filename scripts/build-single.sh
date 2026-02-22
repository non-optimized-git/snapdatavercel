#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INPUT_HTML="$ROOT_DIR/index.html"
INPUT_CSS="$ROOT_DIR/styles.css"
INPUT_JS="$ROOT_DIR/app.js"
INPUT_BOOTSTRAP="$ROOT_DIR/bootstrap.js"
OUTPUT_HTML="$ROOT_DIR/index.single.html"

if [[ ! -f "$INPUT_HTML" || ! -f "$INPUT_CSS" || ! -f "$INPUT_JS" || ! -f "$INPUT_BOOTSTRAP" ]]; then
  echo "Missing required files: index.html, styles.css, app.js, bootstrap.js" >&2
  exit 1
fi

awk -v css_file="$INPUT_CSS" -v js_file="$INPUT_JS" -v boot_file="$INPUT_BOOTSTRAP" '
  BEGIN {
    css = "";
    js = "";
    boot = "";
    while ((getline line < css_file) > 0) css = css line "\n";
    while ((getline line < js_file) > 0) js = js line "\n";
    while ((getline line < boot_file) > 0) boot = boot line "\n";
  }
  {
    if ($0 ~ /<link rel="stylesheet" href="styles\.css">/) {
      print "<style>";
      printf "%s", css;
      print "</style>";
      next;
    }

    if ($0 ~ /<script src="bootstrap\.js"><\/script>/) {
      print "<script id=\"app-inline-code\" type=\"text/plain\">";
      printf "%s", js;
      print "</script>";
      print "<script>";
      printf "%s", boot;
      print "</script>";
      next;
    }

    print $0;
  }
' "$INPUT_HTML" > "$OUTPUT_HTML"

echo "Built: $OUTPUT_HTML"
