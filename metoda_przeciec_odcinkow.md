# Analityczna Metoda Przecięć Odcinków z Promieniem (Okręgiem)
## Zastosowanie dla Analizy Przesłaniania (§ 12 WT) i Nasłonecznienia (§ 56 WT)

---

## 1. Wprowadzenie i Założenia

Zamiast dyskretnego rzutowania promieni pod zadanymi kątami (raycasting), metoda opiera się na **czysto analitycznym przecięciu geometrycznym odcinków ścian obiektów przesłaniających z okręgiem o zadanym promieniu $R$** ze środkiem w badanym punkcie $P(x_0, y_0)$.

### Definicja promienia okręgu $R$:
- **Dla § 12 (Przesłanianie)**:
  $$R = d_{req} = \min(H, 35.0\,\text{m}) \quad (\text{lub } 0.5 \cdot d_{req} \text{ w śródmieściu})$$
- **Dla § 56 (Nasłonecznienie)**:
  $$R = L_{cień} = H \cdot \operatorname{ctg}(\alpha_{sun}) = \frac{H}{\tan(\alpha_{sun})}$$
  gdzie $\alpha_{sun}$ to kąt elewacji Słońca nad horyzontem w danym kierunku.

---

## 2. Równanie Matematyczne Przecięcia Odcinka z Okręgiem

Niech badany punkt ma współrzędne $P = (x_0, y_0)$, a odcinek przeszkody łączy punkty $A = (x_1, y_1)$ oraz $B = (x_2, y_2)$.

### Postać parametryczna odcinka:
$$S(t) = A + t \cdot (B - A), \quad t \in [0, 1]$$
$$\begin{cases} x(t) = x_1 + t \cdot \Delta x \\ y(t) = y_1 + t \cdot \Delta y \end{cases} \quad \text{gdzie } \Delta x = x_2 - x_1, \; \Delta y = y_2 - y_1$$

### Równanie okręgu o promieniu $R$ ze środkiem w $P$:
$$(x - x_0)^2 + (y - y_0)^2 = R^2$$

### Podstawienie odcinka do równania okręgu:
Po podstawieniu $x(t)$ i $y(t)$ otrzymujemy równanie kwadratowe względem parametru $t$:
$$a \cdot t^2 + b \cdot t + c = 0$$

gdzie:
- $a = (\Delta x)^2 + (\Delta y)^2 = |AB|^2$
- $b = 2 \cdot \left[ (x_1 - x_0) \Delta x + (y_1 - y_0) \Delta y \right]$
- $c = (x_1 - x_0)^2 + (y_1 - y_0)^2 - R^2 = |PA|^2 - R^2$

Wyróżnik równania kwadratowego:
$$\Delta = b^2 - 4ac$$

---

## 3. Klasyfikacja Przypadków Geometrycznych

W zależności od odległości wierzchołków $A, B$ od punktu $P$ oraz wartości $\Delta$ wyróżniamy 4 jednoznaczne przypadki:

```
       Przypadek 1                  Przypadek 2                  Przypadek 3B
  (oba wewnątrz: [A, B])      (1 przecięcie: [A, C])       (2 przecięcia: [C1, C2])

         .---.                        .---.                        .---.
       /       \                    /   C   \                    /  C1   C2  \
      |   A---B |                  |   /     |                  |   /-----\   |
       \       /                    \ A     /                    \ /       \ /
         '---'                        '---'                       A         B
                                        B
```

---

### Przypadek 1: Oba wierzchołki wewnątrz okręgu ($|PA| \le R$ oraz $|PB| \le R$)
- **Stan**: Cały odcinek $AB$ leży w strefie oddziaływania (przesłania).
- **Punkty graniczne sektora**: $P_1 = A, \; P_2 = B$.
- **Sektor kątowy**: $[\operatorname{angle}(P, A), \; \operatorname{angle}(P, B)]$.

---

### Przypadek 2: Jeden wierzchołek wewnątrz, drugi na zewnątrz ($|PA| \le R < |PB|$ lub odwrotnie)
- **Stan**: Odcinek przecina okrąg w dokładnie jednym punkcie wewnętrznym dla $t \in [0, 1]$.
- **Wyznaczenie punktu $C$**:
  $$t = \frac{-b + \sqrt{\Delta}}{2a} \quad (\text{dla } t \in [0, 1])$$
  $$C = (x_1 + t \Delta x, \; y_1 + t \Delta y)$$
- **Punkty graniczne sektora**: $P_1 = A$ (wierzchołek wewnątrz), $P_2 = C$ (punkt przecięcia z okręgiem).
- **Sektor kątowy**: $[\operatorname{angle}(P, A), \; \operatorname{angle}(P, C)]$.

---

### Przypadek 3: Oba wierzchołki poza okręgiem ($|PA| > R$ oraz $|PB| > R$)

#### Podprzypadek 3A: $\Delta < 0$ lub brak pierwiastków w przedziale $[0, 1]$
- Prosta nie przecina okręgu lub przecina go poza zakresem odcinka.
- **Wynik**: Odcinek jest w całości poza zasięgiem oddziaływania $\implies$ **BRAK PRZESŁANIANIA**.

#### Podprzypadek 3B: $\Delta \ge 0$ i oba pierwiastki $t_1, t_2 \in [0, 1]$
- Środkowa część długiego odcinka przechodzi przez wnętrze okręgu, mimo że oba końce są daleko.
- **Wyznaczenie punktów przecięcia $C_1, C_2$**:
  $$t_1 = \frac{-b - \sqrt{\Delta}}{2a}, \quad t_2 = \frac{-b + \sqrt{\Delta}}{2a}$$
  $$C_1 = (x_1 + t_1 \Delta x, \; y_1 + t_1 \Delta y)$$
  $$C_2 = (x_1 + t_2 \Delta x, \; y_1 + t_2 \Delta y)$$
- **Punkty graniczne sektora**: $P_1 = C_1, \; P_2 = C_2$.
- **Sektor kątowy**: $[\operatorname{angle}(P, C_1), \; \operatorname{angle}(P, C_2)]$.

---

## 4. Wyznaczanie Kątów i Scalanie Sektorów

1. **Obliczenie kąta biegunowego**:
   Dla każdego wyznaczonego punktu granicznego $Q \in \{A, B, C, C_1, C_2\}$ kąt względem normalnej fasady $\vec{n}$:
   $$\theta = \operatorname{atan2}(Q_y - P_y, \; Q_x - P_x) - \operatorname{atan2}(n_y, n_x)$$
   znormalizowany do przedziału $[-180^\circ, 180^\circ]$.

2. **Przycięcie do kąta widzenia fasady**:
   Sektor jest przycinany do zakresu roboczego fasady $[-78^\circ, +78^\circ]$ (warunek kąta $\ge 12^\circ$ od lica ściany).

3. **Sumowanie i scalanie przedziałów**:
   - Wszystkie uzyskane przedziały kątowe $[\theta_{start}, \theta_{end}]$ są sortowane na osi kątowej.
   - Nakładające się lub stykające przedziały przesłonięte są scalane w sumę mnogościową:
     $$\Omega_{blocked} = \bigcup_{k} [\theta_{start, k}, \; \theta_{end, k}]$$
   - Sektory wolne to dopełnienie:
     $$\Omega_{free} = [-78^\circ, +78^\circ] \setminus \Omega_{blocked}$$

---

## 5. Podsumowanie Korzyści Metody

1. **Brak dyskretyzacji i raycastingu**: Zamiast rzucać setki promieni, rozwiązujemy jedno elementarne równanie kwadratowe na odcinek.
2. **100% dokładność geometryczna**: Granice sektorów wynikają wprost z geometrii (wierzchołki ścian lub punkty styczności/przecięcia z okręgiem).
3. **Brak zjawiska "progresywnego dogęszczania"**: Wynik jest natychmiast ostateczny i stały.

---

## 6. Analityczna Redukcja Nasłonecznienia do Płaszczyzny Równika Niebieskiego ($O(1)$)

W dniu równonocy ($\delta = 0^\circ$) pozorny ruch Słońca po sferze niebieskiej leży ściśle na **płaszczyźnie równika niebieskiego**, nachylonej do płaszczyzny ziemi pod kątem:
$$\beta = 90^\circ - \phi_{lat}$$

### Złota Tożsamość Geometryczna:
Kąt elewacji słońca $\alpha_{sun}(\phi)$ dla azymutu $\phi$ spełnia tożsamość:
$$\tan(\alpha_{sun}(\phi)) = -\cos(\phi) \cdot \tan(\phi_{lat})$$

Zasięg cienia dla punktu $P(x_0, y_0)$ i wysokości przeszkody $\Delta H$:
$$R(\phi) = \frac{\Delta H}{\tan(\alpha_{sun}(\phi))} = \frac{\Delta H}{-\cos(\phi) \cdot \tan(\phi_{lat})} = \frac{L_0}{-\cos(\phi)}$$
gdzie $L_0 = \frac{\Delta H}{\tan(\phi_{lat})}$ jest stałą odległością cienia w południe słoneczne.

### Warunek Cienia w 2D (Linia Prosta):
Ponieważ $y(\phi) - y_0 = R(\phi) \cos(\phi) = -L_0 = \text{const}$, granica cienia w rzucie 2D jest **linią prostą równoległą do osi Wschód-Zachód**:
$$Y_{shadow} = y_0 - L_0 = y_0 - \frac{\Delta H}{\tan(\phi_{lat})}$$

**Twierdzenie**: Dowolny punkt przeszkody $Q(x, y)$ rzuca cień na badany punkt $P$ wtedy i tylko wtedy, gdy:
$$y \ge y_0 - \frac{\Delta H}{\tan(\phi_{lat})}$$

### Algorytm $O(1)$:
1. Przycięcie odcinka przeszkody $AB$ do półpłaszczyzny $Y \ge Y_{shadow}$:
   $$t = \frac{Y_{shadow} - y_1}{y_2 - y_1}$$
2. Kąty skrajne cienia to azymuty przyciętych wierzchołków $A', B'$ widzianych z $P$:
   $$\text{az} = ((\operatorname{atan2}(x - x_0, y - y_0) \cdot \frac{180}{\pi} + 360) \bmod 360)$$
3. Czas trwania wolnych sektorów $\Omega_{free}$:
   $$\Delta t = |t(\phi_{end}) - t(\phi_{start})|$$
4. Całkowity czas nasłonecznienia: $T_{total} = \sum \Delta t_j$.

