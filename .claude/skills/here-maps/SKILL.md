---
name: here-maps
description: Expert in HERE Platform REST API. Invoke when the user builds, debugs, or asks about HERE REST APIs — Map Image (static maps, overlays), Geocoding & Search, Routing, Traffic, or Weather. Also invoke when the user pastes a HERE API URL or error response.
version: 1.1.0
---

# HERE Maps REST API Skill

## Pliki referencyjne

Szczegółowe tabele parametrów, wartości i limitów znajdziesz w:
- `reference/map-image-api.md` — Map Image API v3 (endpointy, parametry, style, features, overlay, ikony)
- `reference/overlay-styling.md` — **stylizacja overlay**: kolory, ikony, rozmiary, tekst, koła, linie, wielokąty, ppi vs scale
- `reference/map-styles.md` — **style mapy**: wszystkie wartości `style=`, features per styl (z `/features` API), Style Editor vs Map Image API, wskazówki wyboru stylu
- `reference/geocoding-api.md` — Geocoding & Search API v7
- `reference/routing-api.md` — Routing API v8 + Matrix Routing
- `reference/limits.md` — wszystkie limity liczbowe

## Autentykacja

**API Key** (query param, prostszy):
```
?apiKey=TWÓJ_KLUCZ
```

**OAuth 2.0 Bearer** (server-side, produkcja):
```
Authorization: Bearer <token>
```
Token z `https://account.api.here.com/oauth2/token`. Wymagany dla Data API.

## Konwencje — kluczowe pułapki

1. **Współrzędne: zawsze `lat,lon`** — Warszawa = `52.2297,21.0122`, nie `21.0122,52.2297`
2. **Wyjątek:** `bbox:` w parametrze `view` (Map Image) używa kolejności `W,S,E,N` — czyli **lon,lat**
3. **Kolor overlay:** `%23RRGGBB` (URL-encoded `#`), nie `#RRGGBB`
4. **Wiele typów geometrii** = wiele parametrów `&overlay=...&overlay=...` (jeden per typ)
5. **Wiele obiektów tego samego typu** = separator `|` w jednym parametrze `overlay`
6. **Właściwości globalne** = ostatni element `overlay` bez geometrii (przed nimi `|`)

## Szybkie przykłady

**Mapa statyczna — jeden POI:**
```
https://image.maps.hereapi.com/mia/v3/base/mc/overlay:padding=64;zoom=16/1536x512/png
  ?apiKey=...
  &overlay=point:52.2297,21.0122|size=large;icon=bubble
  &style=explore.satellite.day&scaleBar=km&features=pois:disabled&lang=pl
```

**Mapa statyczna — wiele POI (Coda.io: `Join("|", lista)`):**
```
&overlay=point:52.2297,21.0122|point:50.0647,19.9450|size=large;icon=bubble
```

**Geocodowanie adresu:**
```
GET https://geocode.search.hereapi.com/v1/geocode?q=Marszałkowska+1,Warszawa&lang=pl&apiKey=...
```

**POI w okolicy:**
```
GET https://geocode.search.hereapi.com/v1/discover?q=restauracja&at=52.2297,21.0122&limit=20&lang=pl&apiKey=...
```

**Trasa samochodem:**
```
GET https://router.hereapi.com/v8/routes
  ?transportMode=car&origin=52.2297,21.0122&destination=50.0647,19.9450
  &return=summary,polyline&departureTime=now&apiKey=...
```

## Debugowanie

**Strategia:** zredukuj URL do minimum, dodawaj parametry jeden po jednym.

**Minimalny URL Map Image:**
```
https://image.maps.hereapi.com/mia/v3/base/mc/512x256/png?apiKey=KLUCZ
```

**Kody HTTP:**

| Kod | Co sprawdzić |
|---|---|
| `400` | Odczytaj `"cause"` i `"parameter"` z JSON body (HERE zawsze zwraca JSON, nawet dla błędów obrazu) |
| `401` | Brak `apiKey` lub zepsutym klucz przy kopiowaniu |
| `403` | Usługa nieaktywowana dla klucza — sprawdź HERE Portal → Apps |
| `404` | Błędna wersja w ścieżce (np. `/v1/` zamiast `/v3/`) |
| `429/503` | Quota lub throttling (może trwać do 10 min) |

**Najczęstsze błędy overlay:**
- Odwrócone współrzędne: `point:21.01,52.22` zamiast `point:52.22,21.01`
- Modyfikator między punktami zamiast na końcu: `...|size=large|point:...` → przenieś na koniec
- Separator `,` zamiast `;` między właściwościami: `size=large,icon=bubble` → `size=large;icon=bubble`

**curl do podglądu nagłówków:**
```bash
curl -v "https://geocode.search.hereapi.com/v1/geocode?q=Warszawa&apiKey=KLUCZ" 2>&1 | head -30
```

Do supportu HERE: zawsze podaj `X-Correlation-ID` z nagłówka odpowiedzi.

## Instrukcje dla Claude

1. Przy detalach parametrów zaglądaj do plików `reference/` — nie improvizuj wartości.
2. `/discover` zamiast `/browse` dla wyszukiwania POI — elastyczniejsze.
3. Routing: pytaj o `transportMode` i `departureTime` zanim zbudujesz URL.
4. `mv` (map version) wygasa po 24h — nie hardkoduj jej.
5. Przy dużej liczbie punktów w overlay: zaproponuj Flexible Polyline lub `geojson`.
6. Format POIx2 z Coda.io: kolumna zawiera `lat,lon` — wklejaj bezpośrednio jako `point:{POIx2}`.
