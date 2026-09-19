import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

export default function PollView() {
    const { id } = useParams();
    const [poll, setPoll] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [voted, setVoted] = useState(false);

    useEffect(() => {
        // 1. Fetch Poll Data
        const fetchPoll = async () => {
            try {
                const res = await fetch(`http://localhost:8080/api/polls/${id}`);
                if (!res.ok) {
                    throw new Error("Failed to load poll");
                }
                const data = await res.json();
                setPoll(data);
            } catch (err) {
                console.error("Fetch error:", err);
                setError("Poll not found or server error.");
            } finally {
                setLoading(false);
            }
        };

        fetchPoll();

        // 2. Setup WebSocket Live Updates
        const ws = new WebSocket(`ws://localhost:8080/ws/polls/${id}`);

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "VOTE_UPDATE" && data.votes) {
                    setPoll((prev) => (prev ? { ...prev, votes: data.votes } : prev));
                }
            } catch (e) {
                console.error("WebSocket message parse error:", e);
            }
        };

        return () => ws.close();
    }, [id]);

    const handleVote = async (optionId) => {
        try {
            const res = await fetch(`http://localhost:8080/api/polls/${id}/vote`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ option_id: optionId }),
            });

            const data = await res.json();
            if (res.ok) {
                setVoted(true);
                if (data.votes) {
                    setPoll((prev) => ({ ...prev, votes: data.votes }));
                }
            } else {
                alert(data.error || "Failed to submit vote");
            }
        } catch (err) {
            console.error("Vote error:", err);
            alert("Error submitting vote");
        }
    };

    if (loading) return <div style={{ padding: "2rem", textAlign: "center" }}>Loading poll...</div>;
    if (error) return <div style={{ padding: "2rem", textAlign: "center", color: "red" }}>{error}</div>;
    if (!poll) return null;

    const totalVotes = poll.votes
        ? Object.values(poll.votes).reduce((acc, curr) => acc + Number(curr), 0)
        : 0;

    return (
        <div style={{ maxWidth: "600px", margin: "2rem auto", padding: "1.5rem" }}>
            <h2>{poll.question}</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1.5rem" }}>
                {poll.options &&
                    poll.options.map((opt) => {
                        const count = poll.votes?.[opt.id] || 0;
                        const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;

                        return (
                            <div
                                key={opt.id}
                                style={{
                                    border: "1px solid #ccc",
                                    borderRadius: "8px",
                                    padding: "1rem",
                                    cursor: voted ? "default" : "pointer",
                                }}
                                onClick={() => !voted && handleVote(opt.id)}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                                    <strong>{opt.text}</strong>
                                    <span>{count} votes ({percentage}%)</span>
                                </div>

                                {/* Simple Bar Progress */}
                                <div style={{ background: "#eee", height: "8px", borderRadius: "4px", overflow: "hidden" }}>
                                    <div
                                        style={{
                                            background: "#3b82f6",
                                            height: "100%",
                                            width: `${percentage}%`,
                                            transition: "width 0.3s ease",
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
            </div>

            {voted && <p style={{ color: "green", marginTop: "1rem" }}>Thanks for voting!</p>}
        </div>
    );
}