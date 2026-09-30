import React, { useEffect, useState } from "react";
import Navbar from "../../components/Navbar";
import { getReports, verifyReport, distributeReport } from "../services/api";

const Reports = () => {
  const [pendingReports, setPendingReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadReports = async () => {
    setLoading(true);
    try {
      const items = await getReports();
      setPendingReports(items);
    } catch (err) {
      console.error("Unable to fetch reports", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleVerify = async (id) => {
    await verifyReport(id);
    loadReports();
  };

  const handleDistribute = async (id) => {
    await distributeReport(id);
    loadReports();
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'Generated': return 'bg-blue-100 text-blue-700';
      case 'Pending Verification': return 'bg-yellow-100 text-yellow-700';
      case 'Signed': return 'bg-purple-100 text-purple-700';
      case 'Distributed': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="min-h-screen bg-cover bg-center" style={{ backgroundImage: "url('/background.png')" }}>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white/90 backdrop-blur-lg rounded-2xl p-8 shadow-xl mb-8 border border-white/40 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Reports & Distribution</h1>
            <p className="text-gray-600">Verification, digital signing, and history tracking</p>
          </div>
          <div className="flex gap-4 mb-1">
             <div className="text-center">
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">To Sign</p>
                <p className="text-2xl font-bold text-blue-600">03</p>
             </div>
             <div className="text-center border-l pl-4">
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Pending</p>
                <p className="text-2xl font-bold text-yellow-500">12</p>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {pendingReports.map((rep, i) => (
            <div key={i} className="bg-white/90 backdrop-blur-lg rounded-2xl p-6 shadow-lg border border-white/40 hover:scale-[1.01] transition-transform flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-2xl">
                    📄
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 text-lg">{rep.patient_name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400 font-medium">#{rep.id}</span>
                        <span className="text-xs text-blue-500 font-bold uppercase">{rep.report_type}</span>
                    </div>
                  </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-8">
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter mb-1">Date</p>
                    <p className="text-sm font-semibold text-gray-700">{new Date(rep.generated_at).toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter mb-1">Revisions</p>
                    <p className={`text-sm font-bold ${rep.revisions > 0 ? 'text-orange-500' : 'text-gray-700'}`}>{rep.revisions || 0}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter mb-1">Status</p>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${getStatusStyle(rep.status)}`}>
                        {rep.status}
                    </span>
                  </div>
                  
                  <div className="flex gap-2 min-w-[200px]">
                      <button
                        className="flex-1 bg-white border border-blue-200 text-blue-600 py-2 rounded-lg text-xs font-bold hover:bg-blue-50 transition"
                        onClick={() => handleVerify(rep.id)}
                      >
                        Verify
                      </button>
                      <button
                        className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-blue-700 shadow shadow-blue-200 transition"
                        onClick={() => handleDistribute(rep.id)}
                      >
                        Sign & Distribute
                      </button>
                  </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Reports;