import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { getDashboardStats, getRecentTests } from "../services/api";
import socket from '../../../app/socket';

const Home = () => {
  const [stats, setStats] = useState({});
  const [recentActivities, setRecentActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  // 🔌 Fetch real dashboard data
  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const statsData = await getDashboardStats();
        const activityData = await getRecentTests();

        setStats(statsData);
        setRecentActivities(activityData);
      } catch (err) {
        console.error("Server connection error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();

    const onResult = (payload) => {
      // when a new result arrives, update recent activities and stats locally
      try {
        const entry = {
          id: payload.id || payload._id || `R${Date.now()}`,
          patient: payload.patient_name || payload.patient_id || 'Unknown',
          test: payload.test_name || '',
          time: new Date(payload.date || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          status: payload.status || 'completed',
        };
        setRecentActivities((prev) => [entry, ...prev].slice(0, 20));
        setStats((s) => ({ ...s, completedTests: (s.completedTests || 0) + 1 }));
      } catch (e) {
        console.error('Socket update error', e);
      }
    };

    socket.on('result-created', onResult);

    return () => socket.off('result-created', onResult);
  }, []);

  return (
    <div
      className="min-h-screen bg-cover bg-center"
      style={{ backgroundImage: "url('/background.png')" }}
    >
      {/* Overlay */}
      <div className="min-h-screen">
        <Navbar />

        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Welcome */}
          <div className="bg-white/90 backdrop-blur-lg rounded-2xl p-8 mb-8 shadow-xl">
            <h1 className="text-3xl font-bold mb-2 text-gray-800">
              Welcome back, Dr. Pathologist 👋
            </h1>
            <p className="text-gray-600">Live lab activity dashboard</p>
          </div>

          {/* Loading */}
          {loading ? (
            <div className="text-center text-white text-lg">Loading dashboard...</div>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                {[
                  { label: "Today's Patients", value: stats.todayPatients, color: "blue" },
                  { label: "Pending Tests", value: stats.pendingTests, color: "yellow" },
                  { label: "Completed Tests", value: stats.completedTests, color: "green" },
                  { label: "Revenue", value: stats.revenue, color: "purple" },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="bg-white/90 backdrop-blur-lg p-6 rounded-xl shadow border-l-4"
                    style={{ borderColor: item.color }}
                  >
                    <p className="text-gray-500 text-sm">{item.label}</p>
                    <p className="text-3xl font-bold text-gray-800">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {[
                  { to: "/patient", title: "New Patient", desc: "Register patient" },
                  { to: "/analyzer", title: "Run Analysis", desc: "Connect machine" },
                  { to: "/reports", title: "Reports", desc: "View reports" },
                ].map((btn, i) => (
                  <Link
                    key={i}
                    to={btn.to}
                    className="bg-white/90 backdrop-blur-lg p-6 rounded-xl shadow hover:scale-105 transition"
                  >
                    <h3 className="font-semibold text-lg">{btn.title}</h3>
                    <p className="text-gray-500 text-sm">{btn.desc}</p>
                  </Link>
                ))}
              </div>

              {/* Recent Tests */}
              <div className="bg-white/90 backdrop-blur-lg rounded-xl shadow p-6">
                <h2 className="text-xl font-bold mb-4">Live Test Activity</h2>

                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Patient</th>
                      <th className="text-left py-2">Test</th>
                      <th className="text-left py-2">Time</th>
                      <th className="text-left py-2">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {recentActivities.map((a) => (
                      <tr key={a.id} className="border-b hover:bg-gray-50">
                        <td className="py-2">{a.patient}</td>
                        <td>{a.test}</td>
                        <td>{a.time}</td>
                        <td>
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              a.status === "completed"
                                ? "bg-green-100 text-green-700"
                                : a.status === "pending"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {a.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;
