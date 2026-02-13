# XY Chart

**Declaration:** `xychart-beta`

## Comprehensive Example

```
xychart-beta
    title "Quarterly Revenue by Region"
    x-axis [Q1, Q2, Q3, Q4]
    y-axis "Revenue (USD)"
    bar "North America" [4200, 5100, 6300, 7800]
    bar "Europe" [3100, 3400, 3900, 4200]
    bar "Asia" [1800, 2200, 2800, 3500]
    line "Total Target" [9000, 10000, 12000, 14000]
```

This shows all features together. Here's what's required vs optional:

**Required:**
- `xychart-beta` declaration
- At least one `bar` or `line` dataset with values in `[brackets]`

**Optional:**
- `title "..."` — chart title (quote multi-word titles)
- `x-axis [...]` — categorical labels; omit for auto-numbered
- `y-axis "title"` — axis label; omit for no label
- `horizontal` after `xychart-beta` — rotates chart (default: vertical); do NOT swap axis definitions — x-axis still holds categories, y-axis still holds the value label
- Series names: `bar "Revenue" [...]` — quote multi-word names; always provide a name for legend clarity

## Horizontal Example

```
xychart-beta horizontal
    title "Team Velocity"
    x-axis [Sprint1, Sprint2, Sprint3, Sprint4]
    y-axis "Story Points"
    bar "Completed" [18, 22, 25, 30]
    bar "Planned" [20, 25, 25, 28]
```

Note: only add `horizontal` — axis definitions stay the same as vertical.

## Y-Axis: Always Prefer Auto-Scale

Use `y-axis "Label"` **without** a manual range. Mermaid auto-scales to fit data with sensible margins.

Manual range (`y-axis "Label" 0 --> 5000`) is only appropriate when you need a fixed baseline for comparison across multiple charts showing the same metric — e.g., a set of monthly dashboards that must share identical axes so visual proportions stay consistent. In practice this almost never applies to summarization output.

## Multiple Bar Series = Stacked Bars

Multiple `bar` entries are rendered as **stacked bars** (not grouped side-by-side). This is the correct way to create stacked bar charts — both vertical and horizontal:

```
bar "Product A" [10, 20, 30]
bar "Product B" [15, 25, 35]
line "Average" [12, 22, 32]
```

Lines overlay on the same axes. For horizontal stacked bars, just add `horizontal` after `xychart-beta`.

## Axes

### X-Axis
- Categorical: `x-axis [jan, feb, "Q1 2024", mar]`
- Numeric range: `x-axis "Time" 0 --> 100`
- Omit entirely for auto-generated indices

### Y-Axis
- With label: `y-axis "Revenue (USD)"`
- Omit entirely for auto-generated scale

## Common Mistakes (will break the chart)

- **Never quote numbers** in data arrays: `[10, 20, 30]` NOT `["10", "20", "30"]`
- **Series name goes before the array**, not inside it: `bar "UK" [50, 5, 1]` NOT `bar ["UK", "50", "5", "1"]`
- **No `\n` in titles** — use a short single-line title instead
- **Don't quote x-axis categories** unless they contain spaces: `x-axis [1900, 1950, 2000]` NOT `x-axis ["1900", "1950", "2000"]`

## Text Rules

Single-word values don't require quotes. Multi-word values need double quotes.
