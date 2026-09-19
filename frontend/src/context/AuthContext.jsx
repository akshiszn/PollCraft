import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token") || "");

  useEffect(() => {
    const savedEmail = localStorage.getItem("user_email");
    if (token && savedEmail) {
      setUser({ email: savedEmail });
    }
  }, [token]);

  const login = (jwtToken, email) => {
    localStorage.setItem("token", jwtToken);
    localStorage.setItem("user_email", email);
    setToken(jwtToken);
    setUser({ email });
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user_email");
    setToken("");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);