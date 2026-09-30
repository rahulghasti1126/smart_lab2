import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const Navbar = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/");
  };

  return (
    <motion.nav
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className=" bg-blue-400  ticky top-5 z-50"
    >
      <div className="max-w-8xl mx-auto px-8">
        <div className="flex justify-between items-center h-16">

          {/* 🔬 Animated Logo */}
          <motion.div
            whileHover={{ scale: 1.08 }}
            className="flex items-center space-x-2 cursor-pointer"
            onClick={() => navigate("/home")}
          >
            <img
              src="/logo.png.png"
              alt="Smart Lab Logo"
              className="w-30 h-14 object-contain drop-shadow-lg"
            />

            <motion.span
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="text-2xl font-bold text-blue-900"
            >
              Smart Lab
            </motion.span>
          </motion.div>

          {/* Navigation Links */}
          <div className="flex items-center space-x-2">
            {[
              { name: "Home", path: "/home" },
              { name: "Patients", path: "/patient" },
              { name: "Analyzer", path: "/analyzer" },
              { name: "Results", path: "/results" },
              { name: "Reports", path: "/reports" },
              { name: "Reagents", path: "/reagents" },
              { name: "Billing", path: "/billing" },
              { name: "History", path: "/history" },
              { name: "Machine Integration", path: "/machine-integration" },
              { name: "Machine Results", path: "/machine-results" },
              { name: "Raw Messages", path: "/raw-messages" },
            ].map((item, i) => (
              <motion.div key={i} whileHover={{ scale: 1.1 }}>
                <Link
                  to={item.path}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-800 hover:text-blue-700 hover:bg-blue-100 transition"
                >
                  {item.name}
                </Link>
              </motion.div>
            ))}
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-3">
            <div className="text-right">
              <div className="text-sm font-semibold text-gray-800">
                {user.name || "Rahul"}
              </div>
              <div className="text-xs text-gray-600">Pathologist</div>
            </div>

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleLogout}
              className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm shadow hover:bg-red-600 transition"
            >
              Logout
            </motion.button>
          </div>
        </div>
      </div>
    </motion.nav>
  );
};

export default Navbar;
