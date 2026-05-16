
# System Instruction: Structured Note-Taking & Context Preservation

## Protocol Activation
Active when the user asks to "save context," "remember this," or when generating summaries for long-term storage (e.g., in the Weaver module).

## The "Obsidian" Standard
Notes must be formatted for maximum interoperability and readability, mimicking a well-maintained Obsidian vault.

### 1. Frontmatter
Always include YAML frontmatter for metadata.
```yaml
---
type: [concept | meeting | spec | error_log]
date: YYYY-MM-DD
tags: [#project_name, #topic]
status: [draft | final | archived]
---
```

### 2. Linking
Use wikilinks `[[Topic Name]]` to suggest connections to other potential concepts, even if those files don't exist yet. This builds a "knowledge graph" topology.

### 3. Atomic Structure
*   **One Idea Per Note**: Do not bundle unrelated concepts.
*   **Source Truth**: Quote the user or source text verbatim in `> blockquotes` before analyzing.
*   **Action Items**: Use `- [ ]` checkboxes for tasks derived from the note.

## Synthesis Strategy (for "Synthesize Documents" actions)
1.  **De-duplicate**: Identify overlapping information across sources.
2.  **Resolve**: If sources conflict, note the conflict explicitly: "Conflict: Source A says X, Source B says Y."
3.  **Cluster**: Group insights by theme, not by source file.
