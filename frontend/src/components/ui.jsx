export function Badge({ level, children }) {
  const map = {
    CRITICAL: "bg-signal-red/15 text-signal-red border-signal-red/40",
    HIGH: "bg-signal-amber/15 text-signal-amber border-signal-amber/40",
    MEDIUM: "bg-signal-blue/15 text-signal-blue border-signal-blue/40",
    LOW: "bg-console-muted/15 text-console-muted border-console-muted/40",
    GREEN: "bg-signal-green/15 text-signal-green border-signal-green/40",
    OPEN: "bg-signal-red/15 text-signal-red border-signal-red/40",
    RESOLVED: "bg-signal-green/15 text-signal-green border-signal-green/40",
  };
  const cls = map[level] || map.MEDIUM;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border rounded-sm ${cls}`}>
      {children ?? level}
    </span>
  );
}

export function Panel({ title, action, children, className = "" }) {
  return (
    <div className={`panel rounded-sm ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-console-border">
          {title && <h3 className="text-sm font-semibold tracking-wide text-console-text">{title}</h3>}
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, tone = "default" }) {
  const toneCls = {
    default: "text-console-text",
    red: "text-signal-red",
    amber: "text-signal-amber",
    green: "text-signal-green",
    blue: "text-signal-blue",
  }[tone];
  return (
    <div className="panel rounded-sm p-4">
      <div className="text-xs uppercase tracking-wider text-console-muted mb-1">{label}</div>
      <div className={`text-2xl font-mono font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}

export function Button({ children, variant = "primary", className = "", ...props }) {
  const variants = {
    primary: "bg-signal-blue hover:bg-blue-500 text-white",
    success: "bg-signal-green hover:bg-green-500 text-console-bg",
    danger: "bg-signal-red hover:bg-red-500 text-white",
    ghost: "bg-transparent border border-console-border hover:border-signal-blue text-console-text",
  };
  return (
    <button
      className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function TimelineBar({ segments }) {
  if (!segments || !segments.length) return null;
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const dayStart = toMin(segments[0].start_time);
  const dayEnd = toMin(segments[segments.length - 1].end_time);
  const total = dayEnd - dayStart || 1;
  const colors = {
    TRAIN: "bg-signal-blue", MAINTENANCE: "bg-signal-amber", FREE: "bg-signal-green/30",
    BUFFER: "bg-console-muted/30", CONFLICT: "bg-signal-red", EMERGENCY: "bg-signal-red",
  };
  return (
    <div>
      <div className="flex h-8 w-full rounded-sm overflow-hidden border border-console-border">
        {segments.map((s, i) => {
          const w = ((toMin(s.end_time) - toMin(s.start_time)) / total) * 100;
          return (
            <div
              key={i}
              title={`${s.start_time}-${s.end_time} ${s.label}`}
              className={`${colors[s.kind] || "bg-console-panel2"} border-r border-console-bg/40`}
              style={{ width: `${w}%` }}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] font-mono text-console-muted mt-1">
        <span>{segments[0].start_time}</span>
        <span>{segments[segments.length - 1].end_time}</span>
      </div>
    </div>
  );
}
