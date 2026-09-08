import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { WS_URL } from "../api/client";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", group: "Overview" },
  { to: "/requests", label: "Maintenance Requests", group: "Planning" },
  { to: "/requests/new", label: "Create Maintenance Task", group: "Planning" },
  { to: "/windows", label: "Block Availability", group: "Planning" },
  { to: "/simulation", label: "What-If Simulation", group: "Planning" },
  { to: "/emergency", label: "Emergency Re-Scheduling", group: "Planning" },
  { to: "/conflicts", label: "Conflicts", group: "Planning" },
  { to: "/live-trains", label: "Live Train Tracking", group: "Trains" },
  { to: "/analytics", label: "Analytics & Reports", group: "Trains" },
];

export default function Layout({ children }) {
  const { manager, logout } = useAuth();
  const navigate = useNavigate();
  const [live, setLive] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);

  useEffect(() => {
    let ws;
    try {
      ws = new WebSocket(`${WS_URL}/ws/dashboard`);
      ws.onopen = () => setLive(true);
      ws.onclose = () => setLive(false);
      ws.onmessage = (msg) => {
        try { setLastEvent(JSON.parse(msg.data)); } catch { /* ignore */ }
      };
    } catch { /* ignore */ }
    return () => ws && ws.close();
  }, []);

  const groups = [...new Set(NAV.map((n) => n.group))];

  return (
    <div className="min-h-screen flex bg-console-bg text-console-text font-sans">
      <aside className="w-64 shrink-0 border-r border-console-border bg-console-panel flex flex-col">
        <div className="px-5 py-5 border-b border-console-border">
          <div className="text-xs tracking-widest text-signal-blue font-mono">SIH 2026 · SIH26027</div>
          <div className="text-lg font-semibold leading-tight mt-1">RailSync AI</div>
          <div className="text-[11px] text-console-muted mt-0.5">Automatic Block Planning</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          {groups.map((g) => (
            <div key={g} className="mb-4">
              <div className="px-5 text-[11px] uppercase tracking-wider text-console-muted mb-1">{g}</div>
              {NAV.filter((n) => n.group === g).map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === "/"}
                  className={({ isActive }) =>
                    `block px-5 py-2 text-sm border-l-2 ${
                      isActive
                        ? "border-signal-blue bg-console-panel2 text-console-text"
                        : "border-transparent text-console-muted hover:text-console-text hover:bg-console-panel2/60"
                    }`
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-console-border text-xs text-console-muted">
          Decision-support prototype — every recommendation requires manager approval.
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-console-border bg-console-panel flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className={`w-2 h-2 rounded-full ${live ? "bg-signal-green" : "bg-signal-red"}`} />
            <span className="text-xs font-mono text-console-muted">
              {live ? "LIVE DASHBOARD CONNECTED" : "WEBSOCKET DISCONNECTED"}
            </span>
            {lastEvent && (
              <span className="text-xs font-mono text-signal-amber ml-4">
                last event: {lastEvent.event}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {manager && (
              <span className="text-sm">
                {manager.full_name} <span className="text-console-muted">· Manager</span>
              </span>
            )}
            <button
              onClick={() => { logout(); navigate("/login"); }}
              className="text-xs px-3 py-1.5 border border-console-border rounded-sm hover:border-signal-red hover:text-signal-red"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
