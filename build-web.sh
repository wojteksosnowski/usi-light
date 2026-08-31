#!/usr/bin/env bash

# ==============================================================================
# Skrypt do automatycznego budowania i pakowania aplikacji USI Light do hostingu
# ==============================================================================

set -e

# Kolory do komunikatów
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}   USI Light - Generator Paczki Produkcyjnej WWW      ${NC}"
echo -e "${BLUE}======================================================${NC}"

# 1. Sprawdzenie Node i npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Błąd: Nie znaleziono polecenia npm. Upewnij się, że Node.js jest zainstalowany.${NC}"
    exit 1
fi

# 2. Uruchomienie testów jednostkowych
echo -e "\n${YELLOW}[1/5] Uruchamianie testów jednostkowych i benchmarków...${NC}"
npx vitest run

# 3. Kompilacja TypeScript i Vite (produkcja)
echo -e "\n${YELLOW}[2/5] Kompilowanie aplikacji produkcyjnej (Vite + TypeScript)...${NC}"
npm run build

# 4. Przygotowanie katalogu dist-web/
OUTPUT_DIR="dist-web"
ZIP_FILE="dist-web.zip"

echo -e "\n${YELLOW}[3/5] Przygotowywanie katalogu wdrożeniowego '${OUTPUT_DIR}'...${NC}"
rm -rf "${OUTPUT_DIR}" "${ZIP_FILE}"
mkdir -p "${OUTPUT_DIR}"

# Kopiowanie skompilowanych plików z dist/ do dist-web/
cp -R dist/* "${OUTPUT_DIR}/"

# 5. Generowanie pliku iframe-embed.html z przykładem osadzenia
echo -e "\n${YELLOW}[4/5] Generowanie szablonu osadzenia w iframe (iframe-embed.html)...${NC}"
cat << 'EOF' > "${OUTPUT_DIR}/iframe-embed.html"
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Przykład Osadzenia USI Light</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #0f172a;
      color: #f8fafc;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 8px;
    }
    p {
      color: #94a3b8;
      margin-bottom: 20px;
    }
    .iframe-wrapper {
      position: relative;
      width: 100%;
      height: 850px;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
      border: 1px solid #334155;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    .code-box {
      margin-top: 30px;
      background: #1e293b;
      padding: 16px;
      border-radius: 8px;
      border: 1px solid #334155;
    }
    pre {
      margin: 0;
      overflow-x: auto;
      color: #38bdf8;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Osadzenie Aplikacji USI Light na Stronie WWW</h1>
    <p>Poniższa ramka prezentuje w pełni działającą aplikację USI Light osadzoną na stronie internetowej.</p>

    <!-- KOD OSADZENIA IFRAME: -->
    <div class="iframe-wrapper">
      <iframe src="./index.html" title="USI Light 2.5D" allow="fullscreen"></iframe>
    </div>

    <div class="code-box">
      <p style="margin-top:0; color:#cbd5e1; font-weight:bold;">Kod do wklejenia na Twojej stronie WWW (np. WordPress, HTML):</p>
      <pre>&lt;iframe src="https://twojadomena.pl/sciezka-do-aplikacji/index.html" width="100%" height="850" frameborder="0" allowfullscreen&gt;&lt;/iframe&gt;</pre>
    </div>
  </div>
</body>
</html>
EOF

# 6. Generowanie pliku .htaccess dla serwerów Apache / LiteSpeed
echo -e "\n${YELLOW}[5/5] Generowanie reguł serwera (.htaccess)...${NC}"
cat << 'EOF' > "${OUTPUT_DIR}/.htaccess"
# Reguły MIME Types dla nowoczesnych aplikacji JS i Web Workerów
<IfModule mod_mime.c>
  AddType application/javascript .js
  AddType application/javascript .mjs
  AddType text/css .css
  AddType image/svg+xml .svg
  AddType application/json .json
  AddType font/woff2 .woff2
</IfModule>

# Włączenie kompresji Gzip / Deflate
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE application/javascript
  AddOutputFilterByType DEFLATE text/javascript
  AddOutputFilterByType DEFLATE text/css
  AddOutputFilterByType DEFLATE text/html
  AddOutputFilterByType DEFLATE application/json
  AddOutputFilterByType DEFLATE image/svg+xml
</IfModule>

# Keszowanie zasobów statycznych
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/svg+xml "access plus 1 month"
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
</IfModule>
EOF

# 7. Pakowanie do archiwum ZIP
if command -v zip &> /dev/null; then
    cd "${OUTPUT_DIR}"
    zip -r "../${ZIP_FILE}" . > /dev/null
    cd ..
    echo -e "${GREEN}✓ Utworzono archiwum: ${ZIP_FILE}${NC}"
fi

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}   SUKCES! Paczka gotowa do wdrożenia na hosting      ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "\nGotowe pliki znajdują się w:"
echo -e "  1. Katalog:  ${BLUE}${OUTPUT_DIR}/${NC} (rozpakowane pliki gotowe na FTP)"
if [ -f "${ZIP_FILE}" ]; then
    echo -e "  2. Archiwum: ${BLUE}${ZIP_FILE}${NC} (paczka ZIP do wgrania przez cPanel)"
fi
echo -e "\n${YELLOW}Instrukcja wdrożenia na hosting:${NC}"
echo -e "  - Wgraj zawartość katalogu ${OUTPUT_DIR}/ (lub wypakuj ${ZIP_FILE}) do folderu publicznego na swoim hostingu (np. public_html/ lub public_html/usi/)."
echo -e "  - Aby osadzić aplikację w ramce iframe na innej stronie, zobacz: ${BLUE}${OUTPUT_DIR}/iframe-embed.html${NC}\n"
