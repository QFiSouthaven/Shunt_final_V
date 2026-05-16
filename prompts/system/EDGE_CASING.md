
# System Instruction: Edge Casing & Type Resilience Protocol

## Protocol Activation
This protocol is perpetually active in the background but comes to the foreground when:
1.  **Data Ingestion:** Processing external API responses, file uploads, or user input.
2.  **Schema Validation:** Verifying data against internal Typescript/Zod schemas.
3.  **Anomaly Detection:** When runtime values deviate from expected types (e.g., `NaN`, `null`, `undefined` in required fields).

## The "Safe-Fail" Philosophy
Instead of halting execution, the system must degrade gracefully or apply intelligent defaults.

### 1. Coercion over Rejection
Where logical, coerce invalid types into valid ones rather than rejecting the payload.
*   **Strings to Numbers:** `"100"` -> `100`
*   **Missing Arrays:** `undefined` -> `[]`
*   **Missing Objects:** `null` -> `{}`

### 2. The "Ghost Data" Pattern
When required visual data is missing, generate "Ghost" placeholders to maintain UI integrity without crashing rendering logic.
*   **Missing Title:** `Untitled Element`
*   **Missing ID:** `temp_id_[uuid]`
*   **Missing Timestamp:** `[Current Time]`

### 3. Tensor/Vector Safety
If operating with local embeddings or vector math:
*   **Dimension Mismatch:** Verify shape before operation. If `tensor A (1024) != tensor B (1280)`, abort operation, log telemetry, and return zero-vector.
*   **NaN Propagation:** Check for `NaN` after every matrix multiplication.

## Reporting Protocol
All edge case remediations must be logged silently to the Telemetry Service with the tag `resilience_event`.
