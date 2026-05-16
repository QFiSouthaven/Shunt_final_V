import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

export function EmbeddedHandbook({ content }: { content: string }) {
  return (
    <Card className="bg-[#0a0a0c] lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-indigo-400 uppercase tracking-widest flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          Project Handbook
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="bg-black/40 border border-slate-800 rounded p-6 max-h-[500px] overflow-y-auto text-sm text-slate-300 prose prose-invert prose-indigo max-w-none">
          <Markdown rehypePlugins={[rehypeSanitize]}>
            {content || "*Handbook source not found.*"}
          </Markdown>
        </div>
      </CardContent>
    </Card>
  );
}
