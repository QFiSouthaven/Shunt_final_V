import { RoomList } from "@/components/section5/RoomList";

export default function RoomsPage() {
  return (
    <div className="p-6 flex flex-col h-screen overflow-hidden">
      <h2 className="text-lg shrink-0 font-semibold text-white mb-6 tracking-wide">ROOMS SYSTEM</h2>
      
      <div className="flex-1 w-full max-w-4xl min-h-0">
        <RoomList />
      </div>
    </div>
  );
}
