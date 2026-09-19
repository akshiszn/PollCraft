import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate, useParams } from "react-router-dom";
import { Mail, Lock, Plus, Trash2, CheckCircle2, Share2, LogOut, BarChart2, List, PieChart as PieIcon, LayoutDashboard, ExternalLink } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";

const API_BASE = "http://localhost:8080/api";
const WS_BASE = "ws://localhost:8080/ws";
const COLORS = ["#0052cc", "#ff5500", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [userEmail, setUserEmail] = useState(localStorage.getItem("email") || "");

  const handleLogin = (newToken, email) => {
    localStorage.setItem("token", newToken);
    localStorage.setItem("email", email);
    setToken(newToken);
    setUserEmail(email);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("email");
    setToken("");
    setUserEmail("");
  };

  return (
    <Router>
      <div className="min-h-screen bg-[#0052cc] text-slate-800 font-sans flex flex-col justify-between">
        {/* Updated Header Navigation */}
        <header className="px-8 py-6 flex items-center justify-between">
          <Link to="/" className="text-3xl font-serif font-bold italic text-white tracking-wide">
            PollCraft
          </Link>
          {token && (
            <div className="flex items-center gap-6 text-white">
              <nav className="flex items-center gap-4">
                <Link
                  to="/create"
                  className="hover:text-blue-200 text-sm font-semibold transition"
                >
                  Create Poll
                </Link>
                <Link
                  to="/dashboard"
                  className="flex items-center gap-1.5 hover:text-blue-200 text-sm font-semibold transition"
                >
                  <LayoutDashboard size={16} /> My Polls
                </Link>
              </nav>
              <div className="h-4 w-px bg-white/30" />
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium opacity-90">{userEmail}</span>
                <button
                  onClick={handleLogout}
                  className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition cursor-pointer"
                >
                  <LogOut size={16} /> Logout
                </button>
              </div>
            </div>
          )}
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <Routes>
            <Route
              path="/signup"
              element={!token ? <SignupPage onAuthSuccess={handleLogin} /> : <Navigate to="/dashboard" replace />}
            />
            <Route
              path="/login"
              element={!token ? <LoginPage onAuthSuccess={handleLogin} /> : <Navigate to="/dashboard" replace />}
            />
            <Route
              path="/create"
              element={token ? <CreatePollPage token={token} /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/dashboard"
              element={token ? <DashboardPage token={token} /> : <Navigate to="/login" replace />}
            />
            <Route path="/poll/:id" element={<PollViewPage />} />
            <Route path="*" element={<Navigate to={token ? "/dashboard" : "/signup"} replace />} />
          </Routes>
        </main>

        <footer className="text-center py-6 text-white/70 text-xs font-medium">
          © 2026 PollCraft
        </footer>
      </div>
    </Router>
  );
}

function DashboardPage({ token }) {
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchMyPolls = async () => {
      try {
        const res = await fetch(`${API_BASE}/my-polls`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load dashboard polls");
        setPolls(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchMyPolls();
  }, [token]);

  if (loading) return <div className="text-white text-lg font-light text-center">Loading Dashboard...</div>;

  return (
    <div className="w-full max-w-4xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-light text-white mb-1">My Polls</h1>
          <p className="text-white/80 text-sm">Manage and track your active real-time polls</p>
        </div>
        <Link
          to="/create"
          className="bg-[#ff5500] hover:bg-[#e64d00] text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-md transition"
        >
          <Plus size={18} /> Create New Poll
        </Link>
      </div>

      {error && <div className="mb-4 text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-lg">{error}</div>}

      {polls.length === 0 ? (
        <div className="bg-white rounded-xl shadow-2xl p-12 text-center">
          <p className="text-slate-500 font-medium mb-4">You haven't created any polls yet.</p>
          <Link
            to="/create"
            className="inline-block bg-[#0052cc] text-white font-bold px-6 py-2.5 rounded-lg text-sm hover:bg-[#003d99] transition"
          >
            Create Your First Poll
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {polls.map((poll) => {
            const totalVotes = poll.votes
              ? Object.values(poll.votes).reduce((acc, curr) => acc + Number(curr), 0)
              : 0;

            return (
              <div key={poll.id} className="bg-white rounded-xl shadow-xl p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2 line-clamp-2">{poll.question}</h3>
                  <div className="text-xs text-slate-400 mb-4">
                    Options: {poll.options?.length || 0} | Total Votes: {totalVotes}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                    Active
                  </span>
                  <Link
                    to={`/poll/${poll.id}`}
                    className="flex items-center gap-1 text-xs font-bold text-[#0052cc] hover:underline"
                  >
                    View Poll <ExternalLink size={14} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SignupPage({ onAuthSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create account");
      onAuthSuccess(data.token, data.email);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-light text-white mb-2">Create Free Account</h1>
        <p className="text-white/80 text-sm">Start making interactive polls in seconds</p>
      </div>

      <div className="bg-white rounded-xl shadow-2xl p-8">
        {error && <div className="mb-4 text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-lg">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="test1@gmail.com"
                className="w-full bg-[#ebf3ff] text-slate-800 px-4 py-3 pr-10 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0052cc] transition"
              />
              <Mail className="absolute right-3 top-3.5 text-slate-400" size={18} />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#ebf3ff] text-slate-800 px-4 py-3 pr-10 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0052cc] transition"
              />
              <Lock className="absolute right-3 top-3.5 text-slate-400" size={18} />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#ff5500] hover:bg-[#e64d00] text-white font-bold py-3.5 rounded-lg text-sm transition shadow-md cursor-pointer disabled:opacity-50 mt-2"
          >
            {loading ? "Creating..." : "Create Account"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-[#0052cc] font-bold hover:underline cursor-pointer">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

function LoginPage({ onAuthSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid email or password");
      onAuthSuccess(data.token, data.email);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-light text-white mb-2">Welcome Back</h1>
        <p className="text-white/80 text-sm">Sign in to manage your active polls</p>
      </div>

      <div className="bg-white rounded-xl shadow-2xl p-8">
        {error && <div className="mb-4 text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-lg">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="test1@gmail.com"
                className="w-full bg-[#ebf3ff] text-slate-800 px-4 py-3 pr-10 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0052cc] transition"
              />
              <Mail className="absolute right-3 top-3.5 text-slate-400" size={18} />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#ebf3ff] text-slate-800 px-4 py-3 pr-10 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0052cc] transition"
              />
              <Lock className="absolute right-3 top-3.5 text-slate-400" size={18} />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#ff5500] hover:bg-[#e64d00] text-white font-bold py-3.5 rounded-lg text-sm transition shadow-md cursor-pointer disabled:opacity-50 mt-2"
          >
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-6">
          Need an account?{" "}
          <Link to="/signup" className="text-[#0052cc] font-bold hover:underline cursor-pointer">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}

function CreatePollPage({ token }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleOptionChange = (index, value) => {
    const updated = [...options];
    updated[index] = value;
    setOptions(updated);
  };

  const addOption = () => {
    if (options.length < 6) setOptions([...options, ""]);
  };

  const removeOption = (index) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const validOptions = options.map((o) => o.trim()).filter((o) => o.length > 0);
    if (!question.trim() || validOptions.length < 2) {
      setError("Please add a question and at least two valid options");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/polls`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question, options: validOptions }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create poll");
      navigate(`/poll/${data.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-light text-white mb-2">Create a New Poll</h1>
        <p className="text-white/80 text-sm">Ask your audience anything in real time</p>
      </div>

      <div className="bg-white rounded-xl shadow-2xl p-8">
        {error && <div className="mb-4 text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-lg">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Poll Question
            </label>
            <input
              type="text"
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What is your favorite frontend framework?"
              className="w-full bg-[#ebf3ff] text-slate-800 px-4 py-3 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0052cc] transition"
            />
          </div>

          <div className="space-y-3">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Options
            </label>
            {options.map((opt, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  type="text"
                  required
                  value={opt}
                  onChange={(e) => handleOptionChange(idx, e.target.value)}
                  placeholder={`Option ${idx + 1}`}
                  className="flex-1 bg-[#ebf3ff] text-slate-800 px-4 py-3 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0052cc] transition"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    className="p-3 text-slate-400 hover:text-red-500 transition cursor-pointer"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {options.length < 6 && (
            <button
              type="button"
              onClick={addOption}
              className="flex items-center gap-1.5 text-xs font-bold text-[#0052cc] hover:underline pt-1 cursor-pointer"
            >
              <Plus size={16} /> Add Another Option
            </button>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#ff5500] hover:bg-[#e64d00] text-white font-bold py-3.5 rounded-lg text-sm transition shadow-md cursor-pointer disabled:opacity-50 mt-4"
          >
            {loading ? "Publishing Poll..." : "Publish Poll"}
          </button>
        </form>
      </div>
    </div>
  );
}

function PollViewPage() {
  const { id } = useParams();
  const [poll, setPoll] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedOption, setSelectedOption] = useState("");
  const [voted, setVoted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState("list");

  useEffect(() => {
    const fetchPoll = async () => {
      try {
        const res = await fetch(`${API_BASE}/polls/${id}`);
        if (!res.ok) throw new Error("Poll not found");
        const data = await res.json();
        setPoll(data);
      } catch (err) {
        setError("Poll not found or server is unreachable.");
      } finally {
        setLoading(false);
      }
    };

    fetchPoll();

    const ws = new WebSocket(`${WS_BASE}/polls/${id}`);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "VOTE_UPDATE" && data.votes) {
          setPoll((prev) => (prev ? { ...prev, votes: data.votes } : prev));
        }
      } catch (e) {
        console.error("WS Parse error", e);
      }
    };

    return () => ws.close();
  }, [id]);

  const handleVote = async () => {
    if (!selectedOption) return;

    try {
      const res = await fetch(`${API_BASE}/polls/${id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option_id: selectedOption }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record vote");

      setVoted(true);
      if (data.votes) {
        setPoll((prev) => ({ ...prev, votes: data.votes }));
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className="text-white text-lg font-light text-center">Loading Poll...</div>;
  if (error) return <div className="text-white text-lg font-light text-center">{error}</div>;
  if (!poll) return null;

  const totalVotes = poll.votes
    ? Object.values(poll.votes).reduce((acc, curr) => acc + Number(curr), 0)
    : 0;

  const chartData = poll.options?.map((opt, idx) => ({
    name: opt.text,
    votes: poll.votes?.[opt.id] || 0,
    fill: COLORS[idx % COLORS.length],
  })) || [];

  return (
    <div className="w-full max-w-xl">
      <div className="bg-white rounded-xl shadow-2xl p-8">
        <div className="flex justify-between items-start mb-6 gap-4">
          <h1 className="text-2xl font-bold text-slate-800">{poll.question}</h1>
          <div className="flex items-center gap-2">
            <div className="bg-slate-100 p-1 rounded-lg flex items-center">
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-md transition cursor-pointer ${viewMode === "list" ? "bg-white text-[#0052cc] shadow-sm" : "text-slate-500"}`}
                title="List View"
              >
                <List size={16} />
              </button>
              <button
                onClick={() => setViewMode("bar")}
                className={`p-1.5 rounded-md transition cursor-pointer ${viewMode === "bar" ? "bg-white text-[#0052cc] shadow-sm" : "text-slate-500"}`}
                title="Bar Chart"
              >
                <BarChart2 size={16} />
              </button>
              <button
                onClick={() => setViewMode("pie")}
                className={`p-1.5 rounded-md transition cursor-pointer ${viewMode === "pie" ? "bg-white text-[#0052cc] shadow-sm" : "text-slate-500"}`}
                title="Pie Chart"
              >
                <PieIcon size={16} />
              </button>
            </div>

            <button
              onClick={copyShareLink}
              className="p-2 text-slate-400 hover:text-[#0052cc] rounded-lg border border-slate-200 transition cursor-pointer"
              title="Copy Poll Link"
            >
              {copied ? <CheckCircle2 size={18} className="text-green-600" /> : <Share2 size={18} />}
            </button>
          </div>
        </div>

        {viewMode === "list" && (
          <div className="space-y-4 mb-6">
            {poll.options?.map((opt) => {
              const count = poll.votes?.[opt.id] || 0;
              const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
              const isSelected = selectedOption === opt.id;

              return (
                <div
                  key={opt.id}
                  onClick={() => !voted && setSelectedOption(opt.id)}
                  className={`relative overflow-hidden border rounded-xl p-4 transition ${voted
                    ? "border-slate-200 cursor-default"
                    : isSelected
                      ? "border-[#0052cc] bg-blue-50/50 cursor-pointer"
                      : "border-slate-200 hover:border-slate-300 cursor-pointer"
                    }`}
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-blue-100/60 transition-all duration-500 -z-0"
                    style={{ width: `${percentage}%` }}
                  />

                  <div className="relative z-10 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      {!voted && (
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? "border-[#0052cc] bg-[#0052cc]" : "border-slate-300"
                            }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      )}
                      <span className="font-semibold text-slate-800">{opt.text}</span>
                    </div>

                    <span className="text-xs font-bold text-slate-500">
                      {count} votes ({percentage}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {viewMode === "bar" && (
          <div className="h-64 w-full mb-6 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} />
                <YAxis allowDecimals={false} stroke="#64748b" fontSize={12} tickLine={false} />
                <Tooltip />
                <Bar dataKey="votes" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {viewMode === "pie" && (
          <div className="h-64 w-full mb-6 flex justify-center items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="votes"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {!voted ? (
          <button
            onClick={handleVote}
            disabled={!selectedOption}
            className="w-full bg-[#ff5500] hover:bg-[#e64d00] text-white font-bold py-3.5 rounded-lg text-sm transition shadow-md disabled:opacity-40 cursor-pointer"
          >
            Submit Vote
          </button>
        ) : (
          <div className="space-y-3">
            <div className="text-center py-2 text-sm font-semibold text-emerald-600 bg-emerald-50 rounded-lg">
              ✓ Vote Recorded! Real-time updates active.
            </div>
            <Link
              to="/create"
              className="block w-full text-center bg-[#0052cc] hover:bg-[#003d99] text-white font-bold py-3 rounded-lg text-sm transition cursor-pointer"
            >
              + Create Another Poll
            </Link>
          </div>
        )}

        <div className="mt-4 text-center text-xs text-slate-400">
          Total Votes: {totalVotes}
        </div>
      </div>
    </div>
  );
}