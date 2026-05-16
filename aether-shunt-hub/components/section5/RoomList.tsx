import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Hash } from "lucide-react";

export async function RoomList() {
  let rooms: any[] = [];
  try {
    const res = await fetch("http://localhost:3000/api/worker/presence", { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      rooms = data.rooms || [];
    }
  } catch (e) {
    //
  }

  return (
    <Card className="flex flex-col h-full bg-[#0a0a0c]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Hash className="h-4 w-4" />
          Rooms
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-2">
        {rooms.length === 0 && (
          <div className="text-xs text-slate-500 italic">No rooms active.</div>
        )}
        {rooms.map(room => {
          return (
            <Link 
              key={room.name} 
              href={`/rooms/${encodeURIComponent(room.name)}/schema`}
              className="flex items-center justify-between p-3 rounded bg-slate-900 border border-slate-800 hover:border-indigo-500/50 transition-colors"
            >
              <div className="flex flex-col gap-1">
                <div className="text-sm font-mono text-white flex items-center gap-2">
                  <Hash className="h-3 w-3 text-slate-500" />
                  {room.name}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">Members: {room.memberCount || 0}</div>
              </div>
            </Link>
          );
        })}
        <div className="mt-4 pt-4 border-t border-slate-800">
          <div className="text-xs text-slate-500 italic font-mono text-center">
             TODO(prompt:section-5-p1): Query room_schemas from D1 as secondary source
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
