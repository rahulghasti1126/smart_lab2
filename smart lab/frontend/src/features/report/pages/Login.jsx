import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { loginUser } from "../services/api";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const user = await loginUser({ username, password });

      localStorage.removeItem("user");
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem(
        "activeUser",
        user.username || user.name || username
      );

      // React Router navigation - prevents Vercel 404
      navigate("/home");
    } catch (err) {
      setError(err.message || "Invalid username or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center relative"
      style={{ backgroundImage: "url('/background.png')" }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0"></div>

      {/* Login Card */}
      <div className="relative bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl w-full max-w-md p-8 border border-white/40">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 shadow">
            <span className="text-3xl">🔬</span>
          </div>

          <h1 className="text-3xl font-bold text-gray-800">
            Smart Lab
          </h1>

          <p className="text-gray-600 mt-1 text-sm">
            Pathology Laboratory Management System
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Username */}
          <div>
            <label className="text-sm font-semibold text-gray-700">
              Username / License ID
            </label>

            <input
              type="text"
              placeholder="Enter username"
              className="mt-2 w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          {/* Password */}
          <div>
            <label className="text-sm font-semibold text-gray-700">
              Password
            </label>

            <input
              type="password"
              placeholder="Enter password"
              className="mt-2 w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {/* Remember Me */}
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" />
              Remember me
            </label>

            <span className="text-blue-600 cursor-pointer hover:underline">
              Forgot Password?
            </span>
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-white font-semibold bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 transition duration-300 shadow-lg"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        {/* Register */}
        <p className="text-center text-sm text-gray-600 mt-6">
          New Pathologist?{" "}
          <Link
            to="/register"
            className="text-blue-600 font-semibold hover:underline"
          >
            Register here
          </Link>
        </p>

        {/* Demo credentials */}
        <div className="mt-6 text-xs text-gray-500 bg-gray-100 p-3 rounded-lg text-center">
          Demo Login → Username: <b>rahul</b> | Password: <b>1234</b>
        </div>
      </div>
    </div>
  );
};

export default Login;