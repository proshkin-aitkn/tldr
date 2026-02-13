# Class Diagram

**Declaration:** `classDiagram`

## Defining Classes

Two methods:
1. Explicit: `class Animal`
2. Via relationship: `Vehicle <|-- Car`

### Class Labels

```
class MyClass["Display Label"]
class MyClass["`Special @#$ Characters`"]
```

## Class Members

Members with `()` are methods; without are attributes.

### Colon Notation

```
class Animal
    Animal : +int age
    Animal : +String gender
    Animal : +isMammal()
```

### Curly Braces

```
class Duck {
    +String beakColor
    -int weight
    #List~Food~ diet
    +swim()
    +quack() void
}
```

### Visibility Modifiers

| Symbol | Meaning |
|--------|---------|
| `+` | Public |
| `-` | Private |
| `#` | Protected |
| `~` | Package/Internal |

### Classifiers

- `*` Abstract (after method): `someMethod()*`
- `$` Static (after method or field): `someMethod()$`, `String someField$`

### Generics

```
class Box~T~ {
    T getData()
}
```

Use tildes `~` instead of angle brackets. Nested declarations like `List<List<int>>` are supported.

### Return Types

```
getSomething() int
```

## Relationships

**WARNING:** `||--o{`, `}|--|{`, `*--o{` are erDiagram-only — they will crash classDiagram. Use only the syntax below:

| Syntax   | Meaning       |
|----------|---------------|
| `<\|--`  | Inheritance   |
| `*--`    | Composition   |
| `o--`    | Aggregation   |
| `-->`    | Association   |
| `--`     | Link (solid)  |
| `..>`    | Dependency    |
| `..\|>`  | Realization   |
| `..`     | Link (dashed) |

```
classA <|-- classB : inherits
classC *-- classD : "1" composes "many"
classE o-- classF
classG --> classH
classI ..> classJ : uses
classK ..|> classL : implements
```

### Cardinality / Multiplicity

```
classA "1" --> "*" classB : has
```

Options: `1`, `0..1`, `1..*`, `*`, `n`, `0..n`, `1..n`

### Two-Way Relations

```
classA <|--|> classB
```

### Lollipop Interface

```
bar ()-- foo
foo --() bar
```

## Annotations

```
class Animal {
    <<interface>>
}
class Shape {
    <<abstract>>
}
class Color {
    <<enumeration>>
    RED
    GREEN
    BLUE
}
class PaymentService {
    <<Service>>
}
```

Separate line syntax:
```
<<Interface>> Duck
```

## Namespaces

```
namespace com.example {
    class Foo
    class Bar
}
```

## Direction

```
classDiagram
    direction RL
```

Options: `TB`, `BT`, `LR`, `RL`

## Notes

```
note "General note\nline2"
note for ClassName "Specific note\nline2"
```

## Comments

```
%% This is a comment
```
