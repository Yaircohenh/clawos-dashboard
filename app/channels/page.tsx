import { getChannels } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function ChannelsPage() {
  const channels = getChannels();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Channels</h1>

      {channels.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
          <p className="text-gray-400 mb-2">No channels detected.</p>
          <p className="text-sm text-gray-500">
            Use <code className="bg-gray-800 px-2 py-0.5 rounded">openclaw channels add</code> to connect a channel.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {channels.map((ch) => (
            <div
              key={ch.name}
              className="bg-gray-900 rounded-xl border border-gray-800 p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg">{ch.name}</h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs ${
                    ch.enabled
                      ? "bg-green-900/50 text-green-400"
                      : "bg-red-900/50 text-red-400"
                  }`}
                >
                  {ch.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <p className="text-sm text-gray-400">{ch.detail || "No details available."}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
