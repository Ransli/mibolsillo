# 💳 UI Spec: Vista Consulta de Tarjeta de Crédito

> Instrucciones para Claude Code — Componente móvil de detalle de tarjeta

---

## Contexto general

Pantalla móvil (ancho ~390px) con **fondo oscuro profundo**. Forma parte de un sistema de banca digital. El componente tiene header, tarjeta visual, tab bar de dos pestañas y contenido scrollable por pestaña.

---

## 🎨 Design Tokens

```css
--bg-base:         #0f1923;
--bg-card:         #ffffff;
--bg-surface:      #1e2e3e;
--bg-separator:    #2a3a4a;

--header-from:     #1b3f6e;
--header-to:       #0a8a80;

--text-primary:    #ffffff;
--text-secondary:  #8a9ab0;
--text-muted:      #5a6a7a;

--accent-teal:     #00c4b4;
--accent-orange:   #f5a623;

--radius-card:     16px;
--radius-sm:       8px;
```

**Tipografía:** Sans-serif limpia — `Inter`, `DM Sans` o similar.

---

## 📐 Layout general

```
┌─────────────────────────────┐
│  [≡]   CONSULTA DE          │  ← Header gradiente azul→teal
│        TARJETA DE CRÉDITO   │
├─────────────────────────────┤
│     [ Card Visual ]         │  ← Tarjeta blanca con sombra
├─────────────────────────────┤
│  [ Detalles ] [ Estados ]   │  ← Tab Bar (2 tabs)
├─────────────────────────────┤
│  Contenido del tab activo   │  ← Scrollable
└─────────────────────────────┘
```

---

## 🔝 Header

- Fondo con gradiente horizontal: `var(--header-from)` → `var(--header-to)`
- Ícono hamburguesa (`≡`) arriba izquierda
- Flecha de retroceso (`←`) arriba izquierda (o combinada con hamburguesa)
- Título **"CONSULTA DE TARJETA DE CRÉDITO"** centrado, blanco, `font-size: 13px`, `letter-spacing: 0.5px`, mayúsculas
- `padding: 16px`

---

## 💳 Card Visual

Tarjeta rectangular flotante, centrada, con:

- `background: var(--bg-card)`
- `border-radius: var(--radius-card)`
- `box-shadow: 0 8px 32px rgba(0,0,0,0.4)`
- `margin: 16px`
- `padding: 20px`
- Proporción aprox. 16:10 (tarjeta bancaria estándar)

### Elementos internos de la tarjeta:

| Elemento | Posición | Descripción |
|---|---|---|
| Logo banco (`IN` + 2 puntos naranjas) | Centro superior | SVG/imagen, colores teal y naranja |
| Últimos 4 dígitos `•••• 5894` | Abajo izquierda | `font-size: 13px`, color `#4a5a7a` |
| Logo VISA | Abajo derecha | Azul marino, tipografía VISA estándar |
| Badge ℹ️ | Esquina superior derecha | Círculo naranja `24px`, flotante fuera del borde de la card |

---

## 🔘 Tab Bar

Dos tabs solamente:

```
[ Detalles ]   [ Estados ]
```

- Contenedor: `background: var(--bg-surface)`, `border-radius: 24px`, `padding: 4px`
- Tab activo: fondo blanco translúcido o borde inferior de `2px solid var(--accent-teal)`
- Tab inactivo: texto `var(--text-secondary)`
- Tab activo: texto `var(--text-primary)`, peso `600`
- Transición suave `transition: all 0.2s ease`

---

## 📋 Tab: DETALLES

Lista de filas `label → valor`. Cada fila:
- Flex row `justify-content: space-between`
- `padding: 12px 16px`
- Separador inferior: `1px solid var(--bg-separator)`

### Datos a mostrar:

| Label | Valor | Color del valor |
|---|---|---|
| Estado | Activa | `var(--text-primary)` |
| Límite aprobado | RD$25,000.00 | `var(--text-primary)` |
| Balance a la fecha | RD$13,031.72 | `var(--accent-teal)` |
| Disp. con sobregiro | RD$15,034.89 | `var(--accent-teal)` |
| Fecha de corte | 01/05/2026 | `var(--text-primary)` |
| Balance al corte | RD$0.00 | `var(--text-primary)` |
| Pago mínimo | RD$0.00 | `var(--text-primary)` |
| Fecha venc. de pago | 26/05/2026 | `var(--text-primary)` |

### Fila especial — Cashback:

Al final de la lista, fila destacada con:
- Ícono de moneda 🪙 a la izquierda
- Texto **"Cashback generado"** en blanco
- Flecha `›` a la derecha en `var(--accent-orange)`
- `background: var(--bg-surface)`, `border-radius: var(--radius-sm)`, `margin: 12px`

---

## 📋 Tab: ESTADOS

### Sección: Filtro de cortes

Fila superior tipo botón:

```
[ 📄  Ver últimos estados                          › ]
```

- Fondo `var(--bg-surface)`, `border-radius: var(--radius-sm)`, `margin: 12px`
- Flecha `›` color `var(--accent-orange)`
- Al presionar, permite navegar entre ciclos de corte anteriores (estados de cuenta)

---

### Sección: Transacciones después del corte

Encabezado de sección:
```
Trans. después del corte:
```
- `font-size: 11px`, color `var(--accent-teal)`, mayúsculas, `padding: 8px 16px`

---

### Ítem de transacción — estructura:

```
┌──────────────────────────────────────────┐
│ NOMBRE COMERCIO              RD$000.00  ›│
│ DD/MM/AAAA  [En tránsito]               │
└──────────────────────────────────────────┘
```

Cada ítem tiene:
- **Línea 1:** Nombre del comercio en mayúsculas, `font-weight: 600`, `var(--text-primary)` + monto alineado a la derecha
- **Línea 2:** Fecha `DD/MM/AAAA` en `var(--text-secondary)` + chip `"En tránsito"` (solo cuando aplica) en naranja/ámbar con fondo semitransparente
- Flecha `›` en `var(--accent-orange)` si el ítem es navegable
- Separador `1px solid var(--bg-separator)` entre ítems

### Datos de ejemplo:

```
SM NACIONAL CAMINO CHI          RD$683.39
27/05/2026  [En tránsito]

OPRET METRO SD               ›  RD$20.00
25/05/2026

STUDIO.CREATIVEFABRICA       ›  RD$3,673.46
25/05/2026

SPOTIFY                      ›  RD$398.15
23/05/2026
```

La lista es **scrollable** verticalmente con `overflow-y: auto`.

---

## ⚙️ Comportamiento y UX

- El tab activo por defecto es **"Detalles"**
- Cambio de tab con **transición suave** (`fade` o `slide` horizontal)
- Ítems con flecha `›` deben tener feedback visual al hover/tap (`opacity: 0.7` o ripple effect)
- La tarjeta visual puede tener un leve efecto de entrada (`fade-in + translateY`) al cargar
- No hay botón de "Beneficios Popular" en ninguna parte de la vista

---

## 🚫 Exclusiones

- ❌ No incluir tab ni sección de "Beneficios"
- ❌ No incluir botones de pago ni transferencia en esta vista
- ❌ No usar fondo blanco en la pantalla base

---

*Spec generada para implementación con Claude Code — Finance Core / BPD-style UI*
