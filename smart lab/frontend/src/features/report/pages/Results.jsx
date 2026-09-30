import React, { useState, useEffect, useRef } from "react";
import Navbar from "../../components/Navbar";
import { getResults } from "../services/api";
import socket from '../../../app/socket';

const Results = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef(null);

  const refreshResults = async () => {
    setLoading(true);
    try {
      const rows = await getResults();
      setResults(rows);
    } catch (err) {
      console.error("Unable to fetch results", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshResults();
    const onResult = (payload) => {
      try {
        const item = {
          id: payload?.id || payload?._id || payload?.result_id,
          patient_id: payload?.patient_id,
          patient_name: payload?.patient_name || payload?.patientName || "Unknown",
          test_name: payload?.test_name || payload?.testName || "Analyzer Test",
          result_value: payload?.result_value || payload?.resultValue || "",
          unit: payload?.unit || "",
          reference_range: payload?.reference_range || payload?.referenceRange || "",
          machine_name: payload?.machine_name || payload?.machineName || "Analyzer",
          status: payload?.status || "Completed",
          date: payload?.date || new Date().toISOString(),
          raw_data: payload?.raw_data || payload?.rawData || "",
        };
        const newItem = { ...item, __new: true };
        setResults((prev) => [newItem, ...prev.filter((entry) => entry.id !== newItem.id)]);

        // scroll container to top so new item is visible
        setTimeout(() => {
          try {
            if (containerRef.current) containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
          } catch (e) {}
        }, 50);

        // clear highlight after 4s
        setTimeout(() => {
          setResults((prev) => prev.map(r => r.id === newItem.id ? { ...r, __new: false } : r));
        }, 4000);
      } catch (e) {
        console.error('Socket result handling error', e);
      }
    };

    const onUserChanged = () => {
      refreshResults();
    };

    socket.on('result-created', onResult);
    window.addEventListener('user:changed', onUserChanged);

    return () => {
      socket.off('result-created', onResult);
      window.removeEventListener('user:changed', onUserChanged);
    };
  }, []);

  const filteredResults = results.filter((r) =>
    r.patient_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.id?.toString().toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-cover bg-center" style={{ backgroundImage: "url('/background.png')" }}>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white/90 backdrop-blur-lg rounded-2xl p-8 shadow-xl mb-8 border border-white/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Centralized Test Results</h1>
            <p className="text-gray-600">Real-time data feed from integrated analyzers</p>
          </div>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Search by ID or Patient..." 
              className="pl-10 pr-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden border border-white/40">
          <div ref={containerRef} className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-blue-600/10 text-blue-900">
                  <th className="p-4 font-bold">Sample ID</th>
                  <th className="p-4 font-bold">Patient Name</th>
                  <th className="p-4 font-bold">Test Type</th>
                  <th className="p-4 font-bold">Result Value</th>
                  <th className="p-4 font-bold">Reference Range</th>
                  <th className="p-4 font-bold">Machine</th>
                  <th className="p-4 font-bold">Raw Data</th>
                  <th className="p-4 font-bold">Status</th>
                  <th className="p-4 font-bold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredResults.length === 0 && (
                  <tr>
                    <td colSpan="8">No patients registered</td>
                  </tr>
                )}
                
                {filteredResults.map((r, i) => (
                  <tr key={i} className={`hover:bg-blue-50/50 transition-colors ${r.__new ? 'bg-yellow-100/60 animate-pulse' : ''}`}>
                    <td className="p-4 font-semibold text-blue-700">{r.id}</td>
                    <td className="p-4 font-medium text-gray-800">{r.patient_name}</td>
                    <td className="p-4 text-gray-600">{r.test_name}</td>
                    <td className="p-4">
                        <span className={`font-bold ${r.status !== 'Normal' ? 'text-red-600' : 'text-gray-800'}`}>
                            {r.result_value} {r.unit}
                        </span>
                    </td>
                    <td className="p-4 text-gray-400 text-sm italic">{r.reference_range}</td>
                    <td className="p-4 text-gray-600">{r.machine_name}</td>
                    <td className="p-4 text-xs font-mono text-gray-500 bg-gray-50/50 rounded max-w-[200px] truncate" title={r.raw_data}>
                      {r.raw_data || '-'}
                    </td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                        r.status === 'Normal' ? 'bg-green-100 text-green-700' : 
                        r.status === 'High' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="p-4 text-gray-500 text-sm">{r.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Results;
