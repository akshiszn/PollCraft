import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Plus, Trash2, Moon, Sun } from "lucide-react";

export default function CreatePoll() {
    const navigate = useNavigate();

    // Dark Mode State
    const [isDarkMode, setIsDarkMode] = useState(
        localStorage.getItem("pollcraft_mode") === "dark"
    );

    // Form States
    const [question, setQuestion] = useState("");
    const [options, setOptions] = useState(["", ""]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const toggleDarkMode = () => {
        const newMode = !isDarkMode;
        setIsDarkMode(newMode);
        localStorage.setItem("pollcraft_mode", newMode ? "dark" : "light");
    };

    const handleAddOption = () => {
        if (options.length < 6) {
            setOptions([...options, ""]);
        }
    };

    const handleRemoveOption = (index) => {
        if (options.length > 2) {
            setOptions(options.filter((_, i) => i !== index));
        }
    };

    const handleOptionChange = (index, value) => {
        const updated = [...options];
        updated[index] = value;
        setOptions(updated);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!question.trim()) return alert("Please enter a question.");

        const validOptions = options.filter((opt) => opt.trim() !== "");
        if (validOptions.length < 2) return alert("Please enter at least 2 options.");

        setIsSubmitting(true);

        const payload = {
            question,
            options: validOptions,
        };

        try {
            const token = localStorage.getItem("token");
            const res = await fetch("http://localhost:8080/api/polls", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token && { "Authorization": `Bearer ${token}` })
                },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (res.ok) {
                navigate(`/polls/${data.id || data._id}`);
            } else {
                // Print the actual error message sent from Go
                console.error("Backend Error:", data);
                alert(`Backend Error (${res.status}): ${JSON.stringify(data)}`);
            }
        } catch (err) {
            console.error("Network/JS Error:", err);
            alert("Server error, check console.");
        } finally {
            setIsSubmitting(false);
        }
    };
    return (
        <div
            className={`min-h-screen font-sans transition-colors duration-200 flex flex-col justify-between ${isDarkMode ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900"
                }`}
        >
            {/* Header */}
            <header className="w-full max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                <Link to="/create" className="text-2xl font-black tracking-tight">
                    <span className="italic mr-1 text-3xl font-serif text-blue-600">pm</span>
                    <span>PollCraft</span>
                </Link>

                {/* Dark Mode Toggle */}
                <button
                    type="button"
                    onClick={toggleDarkMode}
                    className={`p-2 rounded-full border transition cursor-pointer ${isDarkMode
                        ? "bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-800"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-sm"
                        }`}
                    title="Toggle Theme Mode"
                >
                    {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                </button>
            </header>

            {/* Main Container */}
            <main className="w-full max-w-lg mx-auto px-4 py-8 flex-1 flex flex-col justify-center">
                <div
                    className={`rounded-2xl shadow-xl p-6 md:p-8 border transition-colors duration-200 ${isDarkMode
                        ? "bg-slate-900 border-slate-800 text-white"
                        : "bg-white border-slate-200 text-slate-900"
                        }`}
                >
                    <h1 className="text-2xl font-extrabold mb-6">Create a New Poll</h1>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Question Input */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-400">
                                Poll Question
                            </label>
                            <textarea
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                placeholder="What do you want to ask?"
                                rows={3}
                                className={`w-full p-3.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${isDarkMode
                                    ? "bg-slate-950 border-slate-800 text-white placeholder-slate-500"
                                    : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400"
                                    }`}
                            />
                        </div>

                        {/* Options List */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-400">
                                Options
                            </label>
                            <div className="space-y-3">
                                {options.map((opt, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={opt}
                                            onChange={(e) => handleOptionChange(idx, e.target.value)}
                                            placeholder={`Option ${idx + 1}`}
                                            className={`w-full p-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${isDarkMode
                                                ? "bg-slate-950 border-slate-800 text-white placeholder-slate-500"
                                                : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400"
                                                }`}
                                        />
                                        {options.length > 2 && (
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveOption(idx)}
                                                className="p-2.5 rounded-xl text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                                                title="Remove Option"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Add Option Button */}
                            {options.length < 6 && (
                                <button
                                    type="button"
                                    onClick={handleAddOption}
                                    className={`mt-3 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${isDarkMode ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-700"
                                        }`}
                                >
                                    <Plus size={16} /> Add Option
                                </button>
                            )}
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg transition duration-150 cursor-pointer disabled:opacity-50 mt-4"
                        >
                            {isSubmitting ? "Creating Poll..." : "Create Poll"}
                        </button>
                    </form>
                </div>
            </main>

            {/* Footer */}
            <footer className="py-4 text-center text-xs text-slate-500">
                © {new Date().getFullYear()} PollCraft
            </footer>
        </div>
    );
}