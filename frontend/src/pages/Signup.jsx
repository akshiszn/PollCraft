import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock, Mail } from "lucide-react";

export default function Signup() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const res = await fetch("http://localhost:8080/api/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Signup failed");

            if (data.token) localStorage.setItem("token", data.token);
            navigate("/create");
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#0052cc] via-[#0047ba] to-[#003896] text-white flex flex-col justify-between font-sans">

            {/* Top Navbar */}
            <header className="w-full max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                <Link to="/" className="flex items-center gap-2">
                    <div className="flex items-center text-2xl font-black tracking-tight text-white">
                        <span className="italic mr-1 text-3xl font-serif">PollCraft</span>
                    </div>
                </Link>
            </header>

            {/* Main Content */}
            <main className="w-full max-w-md mx-auto px-4 py-6 flex-1 flex flex-col items-center justify-center">

                <div className="text-center mb-6">
                    <h1 className="text-3xl md:text-4xl font-light text-white tracking-wide">
                        Create Free Account
                    </h1>
                    <p className="text-base font-light text-white/80 mt-1">
                        Start making interactive polls in seconds
                    </p>
                </div>

                {/* Card Form */}
                <div className="w-full bg-white rounded-md shadow-2xl overflow-hidden text-slate-800 p-6 md:p-8">

                    {error && (
                        <div className="p-3 mb-4 bg-red-50 border border-red-200 text-red-600 rounded text-xs text-center font-medium">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                                Email Address
                            </label>
                            <div className="relative">
                                <input
                                    type="email"
                                    required
                                    placeholder="name@company.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full p-3 pr-10 border border-slate-300 rounded text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-[#0052cc]"
                                />
                                <Mail size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    type="password"
                                    required
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full p-3 pr-10 border border-slate-300 rounded text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-[#0052cc]"
                                />
                                <Lock size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 mt-2 bg-gradient-to-b from-[#ff6800] to-[#e65100] hover:from-[#f55f00] hover:to-[#d84a00] text-white font-bold text-lg rounded shadow-md transition duration-150 active:scale-[0.99] disabled:opacity-60"
                        >
                            {loading ? "Creating Account..." : "Create Account"}
                        </button>
                    </form>

                    <p className="mt-6 text-center text-xs text-slate-500">
                        Already have an account?{" "}
                        <Link to="/login" className="text-[#0052cc] font-bold hover:underline">
                            Log in
                        </Link>
                    </p>

                </div>
            </main>

            <footer className="py-4 text-center text-xs text-white/60">
                © {new Date().getFullYear()} PollCraft
            </footer>

        </div>
    );
}