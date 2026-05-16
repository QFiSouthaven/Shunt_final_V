// services/skillParser.ts

/**
 * Parses the markdown output from the "Build a Skill" AI to extract individual files.
 * The AI is prompted to return files in a specific format:
 * // path/to/file.ext
 * ```lang
 * file content...
 * ```
 * This function uses a regular expression to capture the path and the content of each block.
 *
 * @param markdown - The raw markdown string from the AI.
 * @returns An array of objects, each containing the `path` and `content` of a file.
 */
export const parseSkillPackagePlan = (markdown: string): { path: string; content: string }[] => {
  const files: { path: string; content: string }[] = [];
  
  // NEW Primary Regex for HTML-style comments: <!-- path: path/to/file.ext -->
  const htmlCommentRegex = /<!--\s*path:\s*([\w\/-]+\.[\w\.-]+)\s*-->\s*\n```[\w-]*\n([\s\S]*?)```/g;
  let match;
  while ((match = htmlCommentRegex.exec(markdown)) !== null) {
    const path = match[1].trim();
    const content = match[2].trim();
    files.push({ path, content });
  }

  // Fallback 1: JS/TS-style comments: // path/to/file.ext
  if (files.length === 0) {
      const fileBlockRegex = /\/\/\s*([\w\/-]+\.[\w\.-]+)\s*\n```[\w-]*\n([\s\S]*?)```/g;
      while ((match = fileBlockRegex.exec(markdown)) !== null) {
        const path = match[1].trim();
        const content = match[2].trim();
        files.push({ path, content });
      }
  }

  // Fallback 2: path inside the code block
  if (files.length === 0) {
    const fallbackRegex = /```[\w-]*\s*\/\/\s*([\w\/-]+\.[\w\.-]+)\n([\s\S]*?)```/g;
    while ((match = fallbackRegex.exec(markdown)) !== null) {
        const path = match[1].trim();
        const content = match[2].trim();
        files.push({ path, content });
    }
  }
  
  // Fallback 3: path in a markdown heading
  if (files.length === 0) {
    const fallbackRegex2 = /###\s*`?([\w\/-]+\.[\w\.-]+)`?\s*\n```[\w-]*\n([\s\S]*?)```/g;
    while ((match = fallbackRegex2.exec(markdown)) !== null) {
        const path = match[1].trim();
        const content = match[2].trim();
        files.push({ path, content });
    }
  }

  return files;
};
