import React, { useEffect, useState } from "react";
import Navbar from "../../components/Navbar";
import { getHistory } from "../services/api";

const History = () => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  const formatActivity = (item) => {
    const base = {
      type: item.event,
      subject: item.details || item.subject || item.event,
      user: item.actor || 'System',
      time: new Date(item.timestamp).toLocaleString(),
      status: 'info',
    };

    switch (item.event) {
      case 'patient_registered':
        return { ...base, type: 'Patient Registration', status: 'success' };
      case 'result_added':
        return { ...base, type: 'Test Result', status: 'success' };
      case 'report_verified':
        return { ...base, type: 'Report Verification', status: 'warning' };
      case 'report_distributed':
        return { ...base, type: 'Report Distribution', status: 'success' };
      case 'reagent_update':
        return { ...base, type: 'Reagent Update', status: 'error' };
      default:
        return base;
    }
  };

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      try {
        const rows = await getHistory();
        setActivities(rows.map(formatActivity));
      } catch (err) {
        console.error("Unable to fetch history", err);
      } finally {
        setLoading(false);
      }
    };
    loadHistory();
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-700 border-green-200';
      case 'warning': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'error': return 'bg-red-100 text-red-700 border-red-200';
      case 'info': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="min-h-screen bg-cover bg-center" style={{ backgroundImage: "url('/background.png')" }}>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white/90 backdrop-blur-lg rounded-2xl p-8 shadow-xl mb-8 border border-white/40 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Audit Trail & History</h1>
            <p className="text-gray-600">Complete log of all laboratory activities and operations</p>
          </div>
          <div className="flex gap-2">
             <button className="bg-white px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 border hover:bg-gray-50">Filter Results</button>
             <button className="bg-blue-600 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:bg-blue-700 shadow-lg">Export CSV</button>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden border border-white/40">
          <div className="p-1 px-6 bg-gray-50/50 border-b flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest py-3">Live Activity Stream</span>
              <span className="text-xs text-blue-600 font-medium">Auto-refreshing</span>
          </div>
          <div className="divide-y divide-gray-100">
            {activities.map((item, i) => (
              <div key={i} className="p-6 hover:bg-white/50 transition-all flex items-start gap-6">
                <div className={`mt-1 h-3 w-3 rounded-full shrink-0 animate-pulse ${
                    item.status === 'success' ? 'bg-green-500' : 
                    item.status === 'error' ? 'bg-red-500' : 
                    item.status === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                }`}></div>
                
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-gray-800">{item.subject}</h3>
                    <span className="text-sm text-gray-400 font-medium">{item.time}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getStatusColor(item.status)}`}>
                        {item.type}
                    </span>
                    <span className="text-sm text-gray-500 italic">Performed by <span className="font-semibold text-gray-700 not-italic">{item.user}</span></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default History;
