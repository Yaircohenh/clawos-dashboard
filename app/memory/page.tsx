"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface MemoryFile {
  agent: string;
  file: string;
  size: number;
  modified: string;
  preview: string;
}

interface SearchResult {
  agent?: string;
  file?: string;
  text?: string;
  score?: number;
  preview?: string;
}

export default function MemoryPage() {
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchMemory();
  }, []);

  async function fetchMemory() {
    try {
      const res = await fetch("/api/memory");
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch {
      toast.error("Failed to load memory");
    } finally {
      setLoading(false);
    }
  }

  async function search() {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/memory?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
        if ((data.results || []).length === 0) toast("No results found");
      }
    } catch {
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  }

  // Group files by agent
  const byAgent: Record<string, MemoryFile[]> = {};
  for (const f of files) {
    if (!byAgent[f.agent]) byAgent[f.agent] = [];
    byAgent[f.agent].push(f);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading memory...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Memory</h1>

      {/* Search */}
      <div className="flex gap-3 mb-6">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && search()}
          placeholder="Search memories across all agents..."
          className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={search}
          disabled={searching}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg text-sm"
        >
          {searching ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Search Results ({searchResults.length})</h2>
          <div className="space-y-2">
            {searchResults.map((r, i) => (
              <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                <div className="flex items-center gap-2 mb-2">
                  {r.agent && <span className="px-2 py-0.5 bg-blue-900/50 text-blue-400 rounded-full text-xs">{r.agent}</span>}
                  {r.file && <span className="text-xs text-gray-500">{r.file}</span>}
                  {r.score !== undefined && <span className="text-xs text-gray-600 ml-auto">score: {r.score.toFixed(2)}</span>}
                </div>
                <p className="text-sm text-gray-300 whitespace-pre-wrap">{r.text || r.preview || "No preview"}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-sm text-gray-400 mb-1">Agents with Memory</div>
          <div className="text-3xl font-bold">{Object.keys(byAgent).length}</div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-sm text-gray-400 mb-1">Total Files</div>
          <div className="text-3xl font-bold">{files.length}</div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-sm text-gray-400 mb-1">Total Size</div>
          <div className="text-3xl font-bold">{formatSize(files.reduce((s, f) => s + f.size, 0))}</div>
        </div>
      </div>

      {/* Memory Files by Agent */}
      {Object.keys(byAgent).length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
          <p className="text-gray-400 mb-2">No memory files found.</p>
          <p className="text-sm text-gray-500">
            Run <code className="bg-gray-800 px-2 py-0.5 rounded">openclaw memory index</code> to index agent memories.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byAgent).map(([agent, agentFiles]) => (
            <section key={agent}>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="text-xl">🧠</span>
                {agent}
                <span className="text-xs text-gray-500">({agentFiles.length} files)</span>
              </h2>
              <div className="space-y-2">
                {agentFiles.map(f => {
                  const key = `${f.agent}/${f.file}`;
                  const isExpanded = expandedFile === key;
                  return (
                    <div key={key} className="bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors">
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer"
                        onClick={() => setExpandedFile(isExpanded ? null : key)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm">{f.file}</span>
                          <span className="text-xs text-gray-500">{formatSize(f.size)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">{new Date(f.modified).toLocaleDateString()}</span>
                          <span className="text-gray-500 text-xs">{isExpanded ? "▲" : "▼"}</span>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-gray-800 pt-3">
                          <pre className="text-xs text-gray-400 bg-gray-800/50 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                            {f.preview}
                            {f.size > 200 && "\n\n... (truncated)"}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
