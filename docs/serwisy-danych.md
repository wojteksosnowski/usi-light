# Katalog Serwisów Danych Przestrzennych

> Moduł `wfs-import` — źródła danych dla USI Light.
> Ostatnia aktualizacja: 2026-09-07

---

## 1. Przegląd

```
┌─────────────────────────────────────────────────────────────────┐
│                   USI Light — Źródła danych                     │
├──────────────────────┬──────────────────────────────────────────┤
│  Warszawa (lokalne)  │  GUGiK (krajowe)                        │
│  ▸ Budynki (WFS)     │  ▸ EGiB budynki + działki (WMS)        │
│  ▸ Działki (WFS)     │  ▸ NMT ShadedRelief (WMS)              │
│  ▸ Drzewa (WFS)      │  ▸ NMPT / DSM 0.5m (WCS)              │
│                      │  ▸ BDOT10k topografia (WMS/WMTS)       │
│                      │  ▸ ULDK — lokalizacja działek (REST)   │
├──────────────────────┴──────────────────────────────────────────┤
│  Ogólne                                                        │
│  ▸ Nominatim OSM — geocoding adresów                           │
│  ▸ dane.gov.pl API — katalog datasetów                         │
└─────────────────────────────────────────────────────────────────┘
```

**Priorytet:** Warszawa → lokalne WFS (szczegółowe wektory).
Poza Warszawą → fallback na krajowe serwisy GUGiK.

---

## 2. WFS Warszawa — Budynki

| Pole | Wartość |
|---|---|
| **URL** | `https://wms2.um.warszawa.pl/geoserver/wfs/wfs` |
| **Typ** | WFS 2.0.0 (GeoServer) |
| **Warstwa** | `wfs:budynki` |
| **CRS** | EPSG:2178 (PL-2000 strefa 7, południk 21°E) |
| **Geometria** | MultiPolygon |
| **Format** | GeoJSON (`application/json`) |
| **Autoryzacja** | Brak (publiczny) |

### Atrybuty

| Atrybut | Typ | Opis |
|---|---|---|
| `ID_BUDYNKU` | string | ID ewidencyjny (`146514_8.1150.34_BUD`) |
| `RODZAJ` | string | `m`=mieszkalny, `t`=techniczny, `i`=inny |
| `KONDYGNACJE_NADZIEMNE` | decimal | Liczba kondygnacji nadziemnych |
| `KONDYGNACJE_PODZIEMNE` | string | Kondygnacje podziemne (często null) |

### Przykładowe zapytanie

```
GET {URL}?service=WFS&version=2.0.0&request=GetFeature
    &typeNames=wfs:budynki&count=100
    &bbox=7500000,5785000,7501000,5786000
    &outputFormat=application/json
```

### Konwersja wysokości

Brak bezpośredniej wysokości → `defaultHeight = KONDYGNACJE_NADZIEMNE × 3.0m`
(fallback: 15m gdy null).

---

## 3. WFS Warszawa — Działki

| Pole | Wartość |
|---|---|
| **URL** | ten sam co budynki |
| **Warstwa** | `wfs:dzialki` |
| **CRS** | EPSG:2178 |
| **Geometria** | MultiPolygon |
| **Format** | GeoJSON |

### Atrybuty

| Atrybut | Opis |
|---|---|
| `ID_DZIALKI` | Pełny ID ewidencyjny (`146517_8.0828.36`) |
| `NUMER_DZIALKI` | Numer działki (`36`) |
| `NUMER_OBREBU` | Numer obrębu (`0828`) |
| `NAZWA_OBREBU` | Nazwa obrębu (`2-08-28`) |
| `NAZWA_GMINY` | Dzielnica (`Dzielnica Włochy`) |
| `POLE_EWIDENCYJNE` | Powierzchnia w m² (często null) |
| `DATA` | Data aktualizacji |

### Przykładowe zapytanie

```
GET {URL}?service=WFS&version=2.0.0&request=GetFeature
    &typeNames=wfs:dzialki&count=50
    &bbox=7492000,5785000,7494000,5786000
    &outputFormat=application/json
```

---

## 4. WFS Warszawa — Drzewa

| Pole | Wartość |
|---|---|
| **URL** | `https://wfs.um.warszawa.pl/serwis` |
| **Wersja** | WFS 1.1.0 ⚠️ (2.0.0 nie w pełni obsługiwana) |
| **Warstwa** | `ns92528565:ZIELEN_DRZEWA` |
| **CRS** | EPSG:2178 |
| **Geometria** | Point |
| **Format** | GML (GeoJSON zwraca InternalError) |

### Atrybuty

| Atrybut | Opis |
|---|---|
| `OBJECTID` | Unikalny ID |
| `NUMER_INWENTARYZACYJNY` | Numer (`D203993`) |
| `NAZWA_POLSKA` | Gatunek po polsku |
| `NAZWA_LACINSKA` | Gatunek po łacinie |
| `WYSOKOSC` | Wysokość w metrach |
| `OBWOD_PNIA_W_CM` | Obwód (może być wiele: `"47, 52, 56"`) |
| `JEDNOSTKA_ZARZADZAJACA` | Zarządca |
| `AKTUALNOSC_DANYCH` | Data aktualizacji |

### Przykładowe zapytanie

```
GET {URL}?service=WFS&version=1.1.0&request=GetFeature
    &typeName=ns92528565:ZIELEN_DRZEWA
    &maxFeatures=10
```

### ⚠️ Uwagi

- Parametr: `typeName` (singular, **nie** `typeNames`)
- `outputFormat=application/json` → InternalError. Użyć GML + parsowanie.
- `OBWOD_PNIA_W_CM` może mieć wiele wartości (drzewa wielopniowe).

---

## 5. WMS GUGiK — EGiB (Krajowa Integracja)

| Pole | Wartość |
|---|---|
| **URL** | `https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow` |
| **Typ** | WMS 1.3.0 |
| **CRS** | EPSG:2180 (PL-1992) |
| **Zasięg** | **Cała Polska** |

### Warstwy

| Warstwa | Tytuł |
|---|---|
| `budynki` | Budynki |
| `dzialki` | Działki ewidencyjne |
| `numery_dzialek` | Numery działek |
| `kontury` | Kontury klasyfikacyjne |
| `uzytki` | Użytki gruntowe |
| `obreby` | Granice obrębów |
| `powiaty` | Powiaty włączone do usługi |

### Przykładowe zapytanie (GetMap)

```
GET {URL}?service=WMS&version=1.3.0&request=GetMap
    &layers=dzialki,budynki
    &bbox=52.22,21.00,52.23,21.01
    &width=512&height=512
    &crs=EPSG:4326&format=image/png&transparent=true
```

### Uwagi

- **Raster obrazu** (nie wektory) — podkład wizualny.
- Fallback poza Warszawą.

---

## 6. WMS GUGiK — NMT ShadedRelief

| Pole | Wartość |
|---|---|
| **URL** | `https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WMS/ShadedRelief` |
| **Typ** | WMS 1.3.0 |
| **Warstwa** | `Raster` ("Cieniowanie w siatce 1m × 1m") |
| **CRS** | EPSG:2180, EPSG:4326, EPSG:3857 |
| **Zasięg** | Cała Polska |

### Przykładowe zapytanie

```
GET {URL}?service=WMS&version=1.3.0&request=GetMap
    &layers=Raster
    &bbox=5770000,7480000,5800000,7530000
    &width=512&height=512&crs=EPSG:2180
    &format=image/png&transparent=true
```

### Uwagi

- Hillshade — wizualizacja rzeźby terenu.
- Opacity 0.3–0.5 pod satelitą.

---

## 7. WCS GUGiK — NMPT (Digital Surface Model)

| Pole | Wartość |
|---|---|
| **URL** | `https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMPT/GRID1/WCS/DigitalSurfaceModel` |
| **Typ** | WCS 2.0.1 / 1.1.1 / 1.0.0 |
| **Coverages** | `DSM_PL-KRON86-NH`, `DSM_PL-EVRF2007-NH` |
| **Rozdzielczość** | **0.5 m** |
| **CRS** | EPSG:2180, EPSG:4326, EPSG:3857 |
| **Formaty** | `image/x-aaigrid`, `image/png`, `image/tiff` |

### Przykładowe zapytanie (GetCoverage)

```
GET {URL}?service=WCS&version=2.0.1&request=GetCoverage
    &CoverageId=DSM_PL-KRON86-NH
    &subset=x(7500000,7500500)&subset=y(5785000,5785500)
    &format=image/x-aaigrid
    &subsettingCRS=http://www.opengis.net/def/crs/EPSG/0/2180
```

### Format Arc/Info ASCII Grid

```
ncols        500
nrows        500
xllcorner    7500000.0
yllcorner    5785000.0
cellsize     0.5
NODATA_value -9999
 105.23 105.24 105.25 ...
```

### Kluczowe: obliczanie wysokości budynków

```
NMPT (DSM) = teren + budynki + drzewa
NMT (DTM)  = sam teren

NMPT − NMT = wysokość obiektów nad terenem
```

Limit: max 7 km² na zapytanie.

---

## 8. WMS GUGiK — BDOT10k

| Pole | Wartość |
|---|---|
| **WMS** | `https://mapy.geoportal.gov.pl/wss/service/pub/guest/kompozycja_BDOT10k_WMS/MapServer/WMSServer` |
| **WMTS** | `https://mapy.geoportal.gov.pl/wss/service/WMTS/guest/wmts/BDOT10k` |
| **Pobieranie** | `https://mapy.geoportal.gov.pl/wss/service/PZGIK/BDOT/WMS/PobieranieBDOT10k` |
| **Szczegółowość** | 1:10 000 |
| **Zasięg** | Cała Polska |

### Uwagi

- Setki warstw (capabilities ~1.6 MB).
- Mniej szczegółowe niż WFS Warszawy.
- Kontekst topograficzny poza Warszawą.

---

## 9. ULDK — Lokalizacja Działek

| Pole | Wartość |
|---|---|
| **URL** | `https://uldk.gugik.gov.pl/` |
| **Typ** | REST |
| **Zasięg** | Cała Polska |

### Operacje

| Operacja | Parametry | Wynik |
|---|---|---|
| `GetParcelById` | `id` (np. `022602_1.0003.59`) | Geometria WKB |
| Po współrzędnych | `X`, `Y`, promień | Geometria WKB |

```
GET https://uldk.gugik.gov.pl/?request=GetParcelById&id=146517_8.0828.36
```

Dokumentacja: `https://uldk.gugik.gov.pl/opis.html`

---

## 10. Geocoding — Nominatim OSM

| Pole | Wartość |
|---|---|
| **URL** | `https://nominatim.openstreetmap.org/search` |
| **Typ** | REST (JSON) |
| **Rate limit** | 1 req/s |
| **Wymagane** | Nagłówek `User-Agent` |

### Przykładowe zapytanie

```
GET {URL}?q=ul.+Marszałkowska+1,+Warszawa
    &format=json&limit=1&countrycodes=pl&addressdetails=1
```

### Odpowiedź

```json
{
  "lat": "52.2297",
  "lon": "21.0122",
  "display_name": "1, Marszałkowska, ...",
  "address": { "road": "Marszałkowska", "city": "Warszawa" }
}
```

---

## 11. dane.gov.pl API

| Pole | Wartość |
|---|---|
| **URL** | `https://api.dane.gov.pl` |
| **Typ** | REST (JSON API v1.0) |
| **Dokumentacja** | `https://api.dane.gov.pl/doc` |

### Wyszukiwanie datasetów

```
GET https://api.dane.gov.pl/datasets?q=budynki&limit=20
GET https://api.dane.gov.pl/1.4/datasets/{id},{slug}/resources
```

### Kluczowe datasety GUGiK

| ID | Tytuł | Opis |
|---|---|---|
| 925 | Ewidencja gruntów i budynków | EGiB — działki katastralne |
| 2028 | NMPT | Numeryczny model pokrycia terenu |
| 2029 | Chmura punktów | LiDAR |
| 2030 | BDOT10k | Obiekty topograficzne |
| 2186 | Modele 3D budynków | LoD2, CityGML 2.0 |
| 672 | Adresy INSPIRE | Dane adresowe GUGiK |

---

## 12. Macierz decyzji

| Dane | Warszawa | Poza Warszawą | Typ integracji |
|---|---|---|---|
| **Budynki** | WFS (wektory, kondygnacje) | WMS EGiB (raster overlay) | Import / Overlay |
| **Działki** | WFS (wektory, numery) | WMS EGiB (raster overlay) | Import / Overlay |
| **Drzewa** | WFS (punkty, atrybuty) | ❌ Brak | Warstwa wizualna |
| **NMT** | ❌ Brak lokalne | WMS ShadedRelief | Overlay |
| **Wysokości** | Kondygnacje × 3m | NMPT WCS (DSM−DTM) | Obliczenia |

### Konwersja CRS

| Źródło | CRS | `geoTransform.ts` |
|---|---|---|
| WFS Warszawa | EPSG:2178 | ✅ PL-2000 strefa 7 |
| GUGiK EGiB | EPSG:2180 | ✅ PL-1992 |
| GUGiK NMT/NMPT | EPSG:2180 | ✅ PL-1992 |
| Nominatim | EPSG:4326 | ✅ WGS84 |

Wszystkie układy obsługiwane przez istniejący `geoTransform.ts`.
