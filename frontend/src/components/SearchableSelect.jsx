import { useEffect, useRef, useState } from "react";

/**
 * Type-to-filter select over an already-fetched local list of options —
 * same search-first interaction as StationSearchInput, but for picking
 * among existing records (e.g. maintenance requests) instead of hitting
 * a live API.
 *
 * options: array of any shape
 * getLabel: (option) => string shown in the input once selected
 * getSearchText: (option) => string matched against the typed query
 * renderOption: (option) => JSX for a suggestion row
 */
export default function SearchableSelect({ options, value, onSelect, getLabel, getSearchText, renderOption, placeholder }) {
  const [query, setQuery] = useState(value ? getLabel(value) : "");
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    setQuery(value ? getLabel(value) : "");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q.length === 0
    ? options
    : options.filter((o) => getSearchText(o).toLowerCase().includes(q));

  function handleChange(text) {
    setQuery(text);
    onSelect(null);
    setOpen(true);
  }

  function pick(option) {
    setQuery(getLabel(option));
    setOpen(false);
    onSelect(option);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || "Type to search…"}
        autoComplete="off"
        className="w-full bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-signal-blue"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto bg-console-panel border border-console-border rounded-sm shadow-lg">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-console-muted">No matches</div>
          )}
          {filtered.map((o, i) => (
            <div key={i} onClick={() => pick(o)}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-console-panel2 border-b border-console-border/50 last:border-0">
              {renderOption ? renderOption(o) : getLabel(o)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
