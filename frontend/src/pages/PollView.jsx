import React, { useState, useEffect } from "react";

// Helper to retrieve or generate a persistent unique ID for the client
const getClientId = () => {
    let clientId = localStorage.getItem("poll_client_id");
    if (!clientId) {
        clientId = crypto.randomUUID();
        localStorage.setItem("poll_client_id", clientId);
    }
    return clientId;
};

const PollView = ({ pollId }) => {
    const [poll, setPoll] = useState(null);
    const [selectedOption, setSelectedOption] = useState(() => {
        return localStorage.getItem(`voted_${pollId}`) || null;
    });
    const [hasVoted, setHasVoted] = useState(() => {
        return !!localStorage.getItem(`voted_${pollId}`);
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    // 1. Fetch initial poll data
    useEffect(() => {
        const fetchPoll = async () => {
            try {
                const response = await fetch(`/api/polls/${pollId}`);
                if (!response.ok) {
                    throw new Error("Failed to load poll data.");
                }
                const data = await response.json();
                setPoll(data);
            } catch (err) {
                console.error("Fetch error:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchPoll();
    }, [pollId]);

    // 2. Real-time updates via WebSocket
    useEffect(() => {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws/polls/${pollId}`;
        const ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                // Handle incoming live vote counts
                if (message.type === "VOTE_UPDATE" && message.votes) {
                    setPoll((prevPoll) => {
                        if (!prevPoll) return prevPoll;
                        return {
                            ...prevPoll,
                            votes: message.votes,
                        };
                    });
                }
            } catch (err) {
                console.error("WebSocket message parsing error:", err);
            }
        };

        ws.onerror = (wsErr) => {
            console.error("WebSocket error:", wsErr);
        };

        return () => {
            ws.close();
        };
    }, [pollId]);

    // 3. Submit vote to API (Includes Option 1 client_id)
    const handleVote = async (optionId) => {
        if (isSubmitting || hasVoted) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const response = await fetch(`/api/polls/${pollId}/vote`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    option_id: optionId,
                    client_id: getClientId(), // Sends unique client_id for server-side Redis lock
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Failed to submit vote.");
            }

            // Lock UI locally on successful vote
            localStorage.setItem(`voted_${pollId}`, optionId);
            setHasVoted(true);
            setSelectedOption(optionId);
        } catch (err) {
            console.error("Vote submission error:", err);
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Helper calculation for total votes
    const getTotalVotes = () => {
        if (!poll || !poll.votes) return 0;
        return Object.values(poll.votes).reduce((sum, count) => sum + count, 0);
    };

    if (loading) {
        return <div className="p-6 text-center text-gray-500">Loading poll...</div>;
    }

    if (error && !poll) {
        return <div className="p-6 text-center text-red-500">Error: {error}</div>;
    }

    const totalVotes = getTotalVotes();

    return (
        <div className="max-w-md mx-auto my-8 p-6 bg-white rounded-xl shadow-md border border-gray-100">
            <h2 className="text-xl font-bold text-gray-800 mb-4">{poll.question}</h2>

            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">
                    {error}
                </div>
            )}

            <div className="space-y-3">
                {poll.options.map((option) => {
                    const voteCount = (poll.votes && poll.votes[option.id]) || 0;
                    const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                    const isSelected = selectedOption === option.id;

                    return (
                        <div key={option.id} className="relative">
                            <button
                                disabled={hasVoted || isSubmitting}
                                onClick={() => handleVote(option.id)}
                                className={`w-full text-left p-4 rounded-lg border transition-all relative overflow-hidden ${hasVoted
                                        ? isSelected
                                            ? "border-blue-500 bg-blue-50/30"
                                            : "border-gray-200 bg-gray-50 cursor-default"
                                        : "border-gray-200 hover:border-blue-400 hover:bg-blue-50/10 cursor-pointer"
                                    }`}
                            >
                                {/* Visual Progress Bar (Shows after voting or on live results) */}
                                {hasVoted && (
                                    <div
                                        className="absolute top-0 left-0 bottom-0 bg-blue-100/60 transition-all duration-500 ease-out"
                                        style={{ width: `${percentage}%` }}
                                    />
                                )}

                                <div className="relative z-10 flex justify-between items-center">
                                    <span className="font-medium text-gray-700">{option.text}</span>
                                    {hasVoted && (
                                        <span className="text-sm font-semibold text-gray-500 ml-2">
                                            {percentage}% ({voteCount})
                                        </span>
                                    )}
                                </div>
                            </button>
                        </div>
                    );
                })}
            </div>

            <div className="mt-6 flex justify-between items-center text-xs text-gray-400 border-t pt-3">
                <span>Total votes: {totalVotes}</span>
                {hasVoted && <span className="text-green-600 font-medium">✓ Vote Recorded</span>}
            </div>
        </div>
    );
};

export default PollView;