import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui";

export default function Register() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ username: "", full_name: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await client.post("/api/auth/register", {
        username: form.username, full_name: form.full_name, password: form.password,
      });
      // auto-login with the same credentials just registered
      await login(form.username, form.password);
      navigate("/");
    } catch (err) {
      setError(err?.response?.data?.detail || "Registration failed");
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
          <p className="text-console-muted text-sm mt-2">Register as a Section Manager</p>
        </div>
        <form onSubmit={handleSubmit} className="panel rounded-sm p-6 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-console-muted mb-1">Full Name</label>
            <input value={form.full_name} onChange={(e) => set("full_name", e.target.value)}
              className="w-full bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-signal-blue" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-console-muted mb-1">Username</label>
            <input value={form.username} onChange={(e) => set("username", e.target.value)}
              className="w-full bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-signal-blue" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-console-muted mb-1">Password</label>
            <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)}
              className="w-full bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-signal-blue" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-console-muted mb-1">Confirm Password</label>
            <input type="password" value={form.confirm} onChange={(e) => set("confirm", e.target.value)}
              className="w-full bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-signal-blue" />
          </div>
          {error && <div className="text-signal-red text-sm">{error}</div>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating account…" : "Register"}
          </Button>
          <div className="text-xs text-console-muted pt-2 border-t border-console-border text-center">
            Already have an account? <Link to="/login" className="text-signal-blue hover:underline">Sign in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
