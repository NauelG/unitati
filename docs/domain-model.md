# Domain model

Draft. Names here become folder names in `src/lib/server/<domain>/` (see [ADR 0002](adr/0002-server-modules-by-domain.md)).

## Domains

| Domain         | Owns                                                                                  |
| -------------- | ------------------------------------------------------------------------------------- |
| `directory`    | `Person`, `Team`, `Department`, `Location`                                            |
| `assets`       | `Asset`, `AssetModel`, `Category`, `Assignment`, `Kit`; later `License`, `Consumable` |
| `service-desk` | `Ticket`, `Queue`, `Comment` (public / internal), `CannedResponse`; later `Sla`       |
| `projects`     | `Project`, `Milestone`, `Task`, `Board`, `Column`; later `TimeEntry`                  |
| `links`        | `Link`: a typed relation between two records of any domain                            |
| cross-cutting  | `ActivityLog`, `Attachment`, `CustomField`, global search                             |

`directory` is the only domain everyone depends on. The other three domains do not import each other's tables; they relate through `links`.

## Core entities

```mermaid
erDiagram
    PERSON ||--o{ ASSIGNMENT : "holds"
    ASSET ||--o{ ASSIGNMENT : "assigned via"
    ASSET }o--|| ASSET_MODEL : "is a"
    ASSET_MODEL }o--|| CATEGORY : "in"
    ASSET }o--o| LOCATION : "located at"
    PERSON }o--o| DEPARTMENT : "belongs to"
    PERSON }o--o{ TEAM : "member of"

    TICKET }o--|| PERSON : "requested by"
    TICKET }o--o| PERSON : "assigned to"
    TICKET }o--|| QUEUE : "in"
    TICKET ||--o{ COMMENT : "has"

    PROJECT ||--o{ MILESTONE : "has"
    PROJECT ||--o{ TASK : "has"
    TASK }o--o| PERSON : "owned by"

    LINK }o--|| ANY_RECORD : "source"
    LINK }o--|| ANY_RECORD : "target"
```

## The `Link` entity

A single table for cross-domain relations:

| Column       | Example                                      |
| ------------ | -------------------------------------------- |
| `sourceType` | `ticket`                                     |
| `sourceId`   | `T-1042`                                     |
| `targetType` | `asset`                                      |
| `targetId`   | `LT-0142`                                    |
| `kind`       | `affects`, `caused`, `tracked-by`, `targets` |
| `createdBy`  | person id                                    |
| `createdAt`  | timestamp                                    |

Allowed `(sourceType, kind, targetType)` triples are declared in code, not free-form:

| Source  | Kind         | Target | Meaning                                   |
| ------- | ------------ | ------ | ----------------------------------------- |
| ticket  | `affects`    | asset  | The ticket is about this device           |
| ticket  | `tracked-by` | task   | The ticket's resolution is a project task |
| task    | `targets`    | asset  | The task acts on this device              |
| project | `targets`    | asset  | The asset is in the project's scope       |
| ticket  | `duplicates` | ticket | Duplicate tickets                         |

**Tradeoff:** a polymorphic table cannot use real foreign keys. The alternative is one join table per pair (`ticket_asset`, `ticket_task`, …), which gives database integrity but more tables and more code per new relation. Decide in the first vertical slice. The polymorphic table is the default because it keeps the domains decoupled and powers a generic "related items" panel.

## Key cross-domain flows

### Ticket about a device

```mermaid
sequenceDiagram
    actor E as Employee
    participant SD as service-desk
    participant D as directory
    participant A as assets
    participant L as links
    E->>SD: open ticket from portal
    SD->>D: resolve requester
    SD->>A: list assets assigned to requester
    E->>SD: pick "LT-0142"
    SD->>L: link(ticket, affects, asset)
    Note over A,L: Asset page now shows the ticket in its history
```

### Ticket escalated to project work

```mermaid
sequenceDiagram
    actor T as Technician
    participant SD as service-desk
    participant P as projects
    participant L as links
    T->>SD: "this needs a project task"
    SD->>P: create task in project X
    SD->>L: link(ticket, tracked-by, task)
    P-->>SD: task done (domain event)
    SD->>SD: suggest resolving the ticket
```

### Refresh project from inventory

```mermaid
sequenceDiagram
    actor M as IT manager
    participant A as assets
    participant P as projects
    participant L as links
    M->>A: filter: model X, purchased before 2023
    M->>P: create project "2027 laptop refresh" with selection
    P->>L: link(project, targets, asset) for each asset
    P->>P: one task per asset (optional)
```
