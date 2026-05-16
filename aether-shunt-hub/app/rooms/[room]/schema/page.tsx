"use client";
import { useState } from "react";
import { use } from "react";
import { RoomSchemaViewer } from "@/components/section5/RoomSchemaViewer";
import { RoomSchemaEditor } from "@/components/section5/RoomSchemaEditor";
import { HopCeilingDisplay } from "@/components/section5/HopCeilingDisplay";
import { RoomMembershipEditor } from "@/components/section5/RoomMembershipEditor";
import { Hash } from "lucide-react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function RoomSchemaPage({ params }: { params: Promise<{ room: string }> }) {
  const resolvedParams = use(params);
  const roomName = decodeURIComponent(resolvedParams.room);
  const [emptyState, setEmptyState] = useState(false);

  return (
    <div className="p-6 flex flex-col h-screen overflow-hidden">
      <div className="shrink-0 mb-6">
         <div className="flex items-center gap-4">
            <Link href="/rooms" className="text-slate-500 hover:text-white transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h2 className="text-xl font-bold font-mono text-white tracking-wide flex items-center gap-2">
              <Hash className="h-5 w-5 text-indigo-500" />
              {roomName}
            </h2>
         </div>
      </div>
      
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-6 min-h-0 overflow-y-auto">
        
        {/* Left Column */}
        <div className="xl:col-span-5 flex flex-col gap-6 min-h-0">
          <div className="flex-1 min-h-0">
            <RoomSchemaViewer room={roomName} setEmptyState={setEmptyState} />
          </div>
          <div className="shrink-0 h-[250px]">
             <HopCeilingDisplay />
          </div>
        </div>

        {/* Right Column */}
        <div className="xl:col-span-7 flex flex-col gap-6 min-h-0">
          <div className="flex-1 min-h-0">
             <RoomSchemaEditor room={roomName} />
          </div>
          <div className="shrink-0 h-[300px]">
             <RoomMembershipEditor />
          </div>
        </div>

      </div>
    </div>
  );
}
