# Sequence Diagram

**Declaration:** `sequenceDiagram`

## Participants

Participants render in order of appearance. Explicitly control order:

```
sequenceDiagram
    participant Alice
    participant Bob
    participant John
```

### Actor Types

```
participant A as Alice    %% box (default)
actor B as Bob            %% stick figure
boundary C as Controller  %% boundary symbol
control D as Handler      %% control symbol
entity E as Entity        %% entity symbol
database F as DB          %% database symbol
collections G as Items    %% collections symbol
queue H as Queue          %% queue symbol
```

### Aliases

```
participant A as Alice
participant J as John
A->>J: Hello John
```

### Dynamic Creation and Destruction (v10.3.0+)

```
sequenceDiagram
    create participant B
    A --> B: Hello
    destroy B
    B --> A: Goodbye
```

Only recipients can be created; senders or recipients can be destroyed.

## Grouping / Box

```
sequenceDiagram
    box Aqua Group Title
        participant Alice
        participant Bob
    end
    box rgb(33,66,99)
        participant John
    end
    box transparent Aqua
        actor Martin
    end
```

Force transparent when group name is a color: `box transparent Aqua`

## Messages (Arrows)

Format: `[Actor][Arrow][Actor]:Message text`

| Syntax     | Description                          |
|------------|--------------------------------------|
| `->`       | Solid line without arrow             |
| `-->`      | Dotted line without arrow            |
| `->>`      | Solid line with arrowhead            |
| `-->>`     | Dotted line with arrowhead           |
| `<<->>`    | Solid bidirectional (v11+)           |
| `<<-->>`   | Dotted bidirectional (v11+)          |
| `-x`       | Solid line with cross                |
| `--x`      | Dotted line with cross               |
| `-)`       | Solid async (open arrow)             |
| `--)`      | Dotted async                         |

```
Alice->>Bob: Hello
Bob-->>Alice: Hi
```

## Activations

```
activate Alice
deactivate Alice
```

Shorthand with `+` and `-` on arrows:

```
Alice->>+Bob: Request     %% activate Bob
Bob-->>-Alice: Response   %% deactivate Bob
```

Stacked activations:
```
Alice->>+Bob: Hello
Bob->>+John: Hi
John-->>-Bob: Response
Bob-->>-Alice: Response
```

## Notes

```
Note right of Alice: Single actor note
Note left of Bob: Left note
Note over Alice,Bob: Spanning note
Note over Alice: Line1<br/>Line2
```

**Maximum 2 participants** in `Note over` — `Note over A,B,C:` will fail. Use separate notes or `rect` for spanning 3+.

## Line Breaks

In messages and notes use `<br/>`:
```
Alice->>John: Hello<br/>Multiline<br/>Message
```

In actor names (requires aliases):
```
participant A as Alice<br/>Manager
```

## Control Flow

### Loop
```
loop Every minute
    Alice->>Bob: ping
end
```

### Alt / Else
```
alt Success
    Alice->>Bob: ok
else Failure
    Alice->>Bob: error
end
```

### Opt (Optional)
```
opt Optional step
    Alice->>Bob: maybe
end
```

### Par (Parallel)
```
par Action1
    Alice->>Bob: msg1
and Action2
    Alice->>Charlie: msg2
end
```

Nested parallel:
```
par outer
    Alice->>Bob: Hello
    par inner
        Bob->>John: Hi
    and
        Bob->>Jane: Hi
    end
and
    Alice->>Jane: Hello
end
```

### Critical
```
critical Must succeed
    Alice->>Bob: important
option Fallback A
    Alice->>Bob: planB
option Fallback B
    Alice->>Bob: planC
end
```

### Break
```
break Something failed
    Alice->>Bob: abort
end
```

### Background Highlighting (rect)
```
rect rgb(200, 220, 255)
    Alice->>Bob: highlighted section
end

rect rgba(0, 0, 255, .1)
    Alice->>John: semi-transparent
end
```

## Sequence Numbers

```
autonumber
```

## Entity Codes / Escaping

Use `#` + base 10 number + `;`:
- `#35;` for `#`
- `#59;` for `;` (semicolons in messages)

HTML character names also supported.

## Comments

```
%% This is a comment
```

## Important Warning

The word `end` in lowercase can break the diagram. Wrap it: `(end)`, `[end]`, `{end}`, or `"end"`.
