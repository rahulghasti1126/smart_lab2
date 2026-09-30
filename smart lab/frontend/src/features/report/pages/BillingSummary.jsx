import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { getBillingSummary } from "../services/api";

const BillingSummary = () => {
  const { period } = useParams();
  const navigate = useNavigate();
  const [summary, setSummary] = useState({ daily: [], monthly: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const currentMonth = new Date().toISOString().slice(0, 7);
  const isMonth = period === "month";
  const rows = useMemo(() => {
    if (isMonth) return (summary.daily || []).filter((item) => item.date.startsWith(currentMonth));
    return summary.monthly || [];
  }, [currentMonth, isMonth, summary]);
  const total = isMonth ? Number(summary.month || 0) : Number(summary.all || 0);

  useEffect(() => {
    getBillingSummary()
      .then(setSummary)
      .catch((err) => setError(err.message || "Unable to load billing summary."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-cover bg-center" style={{ backgroundImage: "url('/background.png')" }}>
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <button type="button" onClick={() => navigate("/billing")} className="text-blue-700 font-bold mb-6 hover:text-blue-900">← Back to Billing</button>
        <div className="bg-white/90 rounded-2xl p-8 shadow-xl border border-white/40 mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-blue-600">Collection summary</p>
            <h1 className="text-3xl font-bold text-gray-800 mt-2">{isMonth ? "This Month Billing" : "All-time Billing"}</h1>
            <p className="text-gray-500 mt-2">{isMonth ? "Daily collection for the current month" : "Month-wise collection history"}</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-6 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">{isMonth ? "Month total" : "All-time total"}</p>
            <p className="text-3xl font-bold text-blue-800 mt-1">₹{total.toFixed(2)}</p>
          </div>
        </div>
        {error && <div className="mb-6 rounded-lg bg-red-100 border border-red-200 p-4 text-red-700">{error}</div>}
        <section className="bg-white/90 rounded-2xl shadow-xl border border-white/40 p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-5">{isMonth ? "Date-wise totals" : "Month-wise totals"}</h2>
          {loading ? <p className="text-gray-500 text-center py-8">Loading collection...</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100"><th className="pb-4">{isMonth ? "Date" : "Month"}</th><th className="pb-4 text-right">Total collection</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.length === 0 ? <tr><td colSpan="2" className="py-10 text-center text-gray-500">No collection recorded.</td></tr> : rows.map((row) => (
                    <tr key={isMonth ? row.date : row.month} className="hover:bg-blue-50/30"><td className="py-4 font-semibold text-gray-700">{isMonth ? new Date(`${row.date}T00:00:00`).toLocaleDateString() : new Date(`${row.month}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</td><td className="py-4 text-right font-bold text-gray-800">₹{Number(row.total || 0).toFixed(2)}</td></tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-gray-200"><td className="pt-5 font-bold text-gray-700">Total</td><td className="pt-5 text-right text-xl font-bold text-blue-700">₹{total.toFixed(2)}</td></tr></tfoot>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default BillingSummary;
