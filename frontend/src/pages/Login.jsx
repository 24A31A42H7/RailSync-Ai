import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("manager1");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(err?.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-console-bg font-sans text-console-text">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-xs tracking-widest text-signal-blue font-mono mb-2">SIH 2026 · SIH26027</div>
          <h1 className="text-2xl font-semibold">RailSync AI</h1>
          <p className="text-console-muted text-sm mt-2">
            AI-powered automatic block planning to maximize asset availability
          </p>
        </div>
        <form onSubmit={handleSubmit} className="panel rounded-sm p-6 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-console-muted mb-1">Manager Username</label>
            <input
              value={username} onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-signal-blue"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-console-muted mb-1">Password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-signal-blue"
            />
          </div>
          {error && <div className="text-signal-red text-sm">{error}</div>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
          <div className="text-xs text-console-muted pt-2 border-t border-console-border">
            Demo manager account: <span className="font-mono">manager1</span> /
            <span className="font-mono"> password123</span>
          </div>
          <div className="text-xs text-console-muted text-center">
            New manager? <Link to="/register" className="text-signal-blue hover:underline">Register here</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
