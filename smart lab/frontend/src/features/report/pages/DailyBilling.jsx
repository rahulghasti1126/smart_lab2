import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { getBilling } from "../services/api";

const getLocalDateKey = (value) => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const DailyBilling = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const today = getLocalDateKey(new Date());

  useEffect(() => {
    const loadTodayBilling = async () => {
      try {
        const rows = await getBilling();
        setInvoices(rows.filter((invoice) => getLocalDateKey(invoice.date) === today));
      } catch (err) {
        setError(err.message || "Unable to load today's billing.");
      } finally {
        setLoading(false);
      }
    };
    loadTodayBilling();
  }, [today]);

  const total = useMemo(
    () => invoices.reduce((sum, invoice) => sum + (Number(invoice.amount) || 0), 0),
    [invoices]
  );

  return (
    <div className="min-h-screen bg-cover bg-center" style={{ backgroundImage: "url('/background.png')" }}>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <button type="button" onClick={() => navigate("/billing")} className="text-blue-700 font-bold mb-6 hover:text-blue-900">
          ← Back to Billing
        </button>
        <div className="bg-white/90 backdrop-blur-lg rounded-2xl p-8 shadow-xl border border-white/40 mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-blue-600">Daily collection</p>
            <h1 className="text-3xl font-bold text-gray-800 mt-2">Today&apos;s Patient Billing</h1>
            <p className="text-gray-500 mt-2">{new Date(`${today}T00:00:00`).toLocaleDateString()}</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-6 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Today total</p>
            <p className="text-3xl font-bold text-blue-800 mt-1">₹{total.toFixed(2)}</p>
          </div>
        </div>

        {error && <div className="mb-6 rounded-lg bg-red-100 border border-red-200 p-4 text-red-700">{error}</div>}
        <section className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-white/40 p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-5">Today&apos;s Patients ({invoices.length})</h2>
          {loading ? <p className="text-gray-500 text-center py-8">Loading today&apos;s billing...</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">
                    <th className="pb-4">Patient</th>
                    <th className="pb-4">Tests</th>
                    <th className="pb-4">Payment status</th>
                    <th className="pb-4">Time</th>
                    <th className="pb-4 text-right">Patient amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.length === 0 ? (
                    <tr><td colSpan="5" className="py-10 text-center text-gray-500">No patient billing recorded today.</td></tr>
                  ) : invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-blue-50/30">
                      <td className="py-4 font-bold text-gray-800">{invoice.patient_name || "Unknown patient"}</td>
                      <td className="py-4 text-sm text-gray-500">{invoice.items || "Lab tests"}</td>
                      <td className="py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${invoice.status === "Paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {invoice.status || "Unpaid"}
                        </span>
                      </td>
                      <td className="py-4 text-sm text-gray-500">{new Date(invoice.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="py-4 text-right font-bold text-gray-800">₹{Number(invoice.amount || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200">
                    <td colSpan="4" className="pt-5 text-right font-bold text-gray-700">Today total</td>
                    <td className="pt-5 text-right text-xl font-bold text-blue-700">₹{total.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default DailyBilling;
