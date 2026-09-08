import axios from "axios";

// The backend URL is the only thing the frontend needs to know — the
// Railway Data API key itself lives only in backend/.env and is never
// sent to or read by this app.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://railsync-ai-backend-1.onrender.com";

const client = axios.create({ baseURL: BASE_URL });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("rsai_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem("rsai_token");
      localStorage.removeItem("rsai_manager");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export const WS_URL = BASE_URL.replace(/^http/, "ws");

export default client;
