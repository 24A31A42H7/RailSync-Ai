import { useEffect, useRef, useState } from "react";
import client from "../api/client";

/**
 * Type-ahead station search backed by GET /api/stations/search — never a
 * hardcoded dropdown. Calls the backend, which itself calls the live
 * RailRadar API once RAILWAY_API_KEY is configured, or a realistic mock
 * fallback until then (spec section 3).
 */
export default function StationSearchInput({ label, value, onSelect, placeholder }) {
  const [query, setQuery] = useState(value ? `${value.name} (${value.code})` : "");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [dataSource, setDataSource] = useState(null);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, []);

  function handleChange(text) {
    setQuery(text);
    onSelect(null); // clear selection until a suggestion is chosen again
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await client.get(`/api/stations/search?q=${encodeURIComponent(text.trim())}`);
        setSuggestions(data.stations || []);
        setDataSource(data.data_source);
        setOpen(true);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function pick(station) {
    setQuery(`${station.name} (${station.code})`);
    setSuggestions([]);
    setOpen(false);
    onSelect(station);
  }

  return (
    <div ref={containerRef} className="relative">
      {label && <label className="block text-xs uppercase tracking-wider text-console-muted mb-1">{label}</label>}
      <input
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => suggestions.length && setOpen(true)}
        placeholder={placeholder || "Type station name or code…"}
        autoComplete="off"
        className="w-full bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-signal-blue"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-console-panel border border-console-border rounded-sm shadow-lg">
          {loading && <div className="px-3 py-2 text-xs text-console-muted">Searching…</div>}
          {!loading && suggestions.length === 0 && (
            <div className="px-3 py-2 text-xs text-console-muted">No stations found</div>
          )}
          {!loading && suggestions.map((s) => (
            <div
              key={s.code}
              onClick={() => pick(s)}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-console-panel2 border-b border-console-border/50 last:border-0"
            >
              <span className="font-medium">{s.name}</span>
              <span className="ml-2 font-mono text-signal-blue text-xs">{s.code}</span>
              {s.city && <div className="text-console-muted text-xs">{s.city}</div>}
            </div>
          ))}
          {!loading && dataSource && (
            <div className="px-3 py-1 text-[10px] text-console-muted border-t border-console-border">
              {dataSource === "REAL_API" ? "Live station data" : "Simulated station data"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
