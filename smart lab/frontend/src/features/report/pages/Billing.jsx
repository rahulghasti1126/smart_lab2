import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { getBilling, getBillingSummary, getPaymentQr, savePaymentQr, createInvoice, getPatients, getResults } from "../services/api";
import { LAB_TESTS_DATA } from "../constants";

const Billing = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [patients, setPatients] = useState([]);
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState({ today: 0, month: 0, all: 0, daily: [], monthly: [] });
  const [paymentQr, setPaymentQr] = useState("");
  const [qrSaving, setQrSaving] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState("");
  const [selectedTests, setSelectedTests] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState("Unpaid");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const subTotal = selectedTests.reduce((sum, test) => sum + (LAB_TESTS_DATA[test]?.mrp || 0), 0);
  const finalAmount = Math.max(0, subTotal - (parseFloat(discount) || 0));
  const itemsString = selectedTests.join(", ");

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const rows = await getBilling();
      setInvoices(rows);
      const totals = await getBillingSummary();
      setSummary(totals);
    } catch (err) {
      console.error("Unable to load billing data", err);
      setError("Unable to load billing data");
    } finally {
      setLoading(false);
    }
  };

  const loadPatients = async () => {
    try {
      const rows = await getPatients();
      setPatients(rows);
    } catch (err) {
      console.error("Unable to load patients", err);
    }
  };

  const loadPaymentQr = async () => {
    try {
      const response = await getPaymentQr();
      setPaymentQr(response.paymentQr || "");
    } catch (err) {
      console.error("Unable to load payment QR", err);
    }
  };

  const loadResults = async () => {
    try {
      setResults(await getResults());
    } catch (err) {
      console.error("Unable to load patient tests", err);
    }
  };

  useEffect(() => {
    loadInvoices();
    loadPatients();
    loadResults();
    loadPaymentQr();
  }, []);

  const selectPatient = (patientId) => {
    setSelectedPatient(patientId);
    const patient = patients.find((item) => item.id === patientId);
    const resultTests = results
      .filter((result) => result.patient_id === patientId && result.test_name)
      .map((result) => result.test_name)
      .filter((test, index, all) => all.indexOf(test) === index && LAB_TESTS_DATA[test]);
    const profileTests = patient?.test_type
      ? patient.test_type.split(",").map((test) => test.trim()).filter((test) => LAB_TESTS_DATA[test])
      : [];
    setSelectedTests(resultTests.length ? resultTests : profileTests);
  };

  const getPatient = (invoice) => patients.find((patient) => patient.id === invoice.patient_id);

  const printInvoice = (invoice) => {
    const patient = getPatient(invoice);
    const tests = String(invoice.items || "Lab tests").split(",").map((test) => test.trim()).filter(Boolean);
    const testRows = tests.map((test) => `<div class="item"><span>${test}</span><strong>₹${Number(LAB_TESTS_DATA[test]?.mrp || 0).toFixed(2)}</strong></div>`).join("");
    const printWindow = window.open("", "_blank", "width=700,height=800");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>${invoice.id}</title><style>
        *{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;background:#f1f5f9;color:#172033}.invoice{max-width:680px;margin:24px auto;background:#fff;padding:36px;border-top:8px solid #2563eb;box-shadow:0 4px 18px #cbd5e1}.brand{display:flex;justify-content:space-between;align-items:start;border-bottom:2px solid #e2e8f0;padding-bottom:18px}.brand h1{margin:0;color:#1d4ed8}.label{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b}.patient{background:#eff6ff;padding:14px;margin:20px 0}.row,.item{display:flex;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding:11px 0}.heading{font-size:12px;font-weight:bold;text-transform:uppercase;color:#64748b}.total{font-size:22px;font-weight:700;margin-top:18px;display:flex;justify-content:space-between}.footer{text-align:center;color:#64748b;font-size:12px;margin-top:28px}@media print{body{background:#fff}.invoice{margin:0;box-shadow:none;max-width:none}}
      </style></head><body>
      <div class="invoice"><div class="brand"><div><h1>SMART LAB</h1><div class="label">Diagnostic Laboratory</div></div><div class="label">Patient Invoice</div></div>
      <div class="patient"><strong>${invoice.patient_name || patient?.name || "Unknown"}</strong><br><span class="label">Phone: ${invoice.patient_phone || patient?.phone || "-"}</span><br><span class="label">Date: ${new Date(invoice.date).toLocaleString()}</span></div>
      <div class="row heading"><span>Test name</span><span>Price</span></div>${testRows}
      <div class="row"><span>Discount</span><span>₹${Number(invoice.discount || 0).toFixed(2)}</span></div>
      <div class="total"><span>Total payable</span><span>₹${Number(invoice.amount || 0).toFixed(2)}</span></div>
      <p class="label">Payment status: ${invoice.status || "Unpaid"}</p>
      ${paymentQr ? `<div style="margin-top:24px;text-align:center"><strong>Scan to pay with PhonePe</strong><br><img src="${paymentQr}" alt="PhonePe QR" style="width:180px;height:180px;object-fit:contain;margin-top:8px" /></div>` : ""}<div class="footer">Thank you for choosing Smart Lab</div></div>
      </body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const getInvoiceMessage = (invoice, patient) => `Smart Lab Invoice\nInvoice: ${invoice.id}\nPatient: ${invoice.patient_name || patient?.name || "Unknown"}\nTests: ${invoice.items || "Lab tests"}\nTotal: ₹${Number(invoice.amount || 0).toFixed(2)}\nStatus: ${invoice.status || "Unpaid"}${paymentQr ? "\nPhonePe QR is available on the printed bill." : ""}`;

  const sendInvoiceOnWhatsApp = async (invoice) => {
    const patient = getPatient(invoice);
    const phone = (invoice.patient_phone || patient?.phone || "").replace(/\D/g, "");
    if (!phone) {
      alert("Patient phone number is not available.");
      return;
    }
    const message = getInvoiceMessage(invoice, patient);
    const whatsappUrl = `https://web.whatsapp.com/send?phone=${phone.startsWith("91") ? phone : `91${phone}`}&text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
    if (paymentQr) {
      try {
        const qrResponse = await fetch(paymentQr);
        const qrBlob = await qrResponse.blob();
        if (navigator.clipboard?.write && window.ClipboardItem) {
          await navigator.clipboard.write([
            new ClipboardItem({ [qrBlob.type || "image/png"]: qrBlob }),
          ]);
          setStatusMessage("WhatsApp Web opened. QR photo copied; press Ctrl+V in the patient chat to paste it.");
          return;
        }
      } catch (err) {
        console.error("Unable to copy QR photo", err);
      }
      const qrLink = document.createElement("a");
      qrLink.href = paymentQr;
      qrLink.download = "smart-lab-phonepe-qr.png";
      document.body.appendChild(qrLink);
      qrLink.click();
      document.body.removeChild(qrLink);
      setStatusMessage("WhatsApp Web opened. PhonePe QR photo downloaded; attach it to the same chat.");
    }
  };

  const handleQrUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 4 * 1024 * 1024) {
      setError("Please choose an image smaller than 4 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPaymentQr(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSaveQr = async () => {
    if (!paymentQr) {
      setError("Please upload a PhonePe QR image first.");
      return;
    }
    setQrSaving(true);
    try {
      const response = await savePaymentQr(paymentQr);
      setPaymentQr(response.paymentQr);
      setStatusMessage("PhonePe QR saved successfully.");
    } catch (err) {
      setError(err.message || "Unable to save payment QR.");
    } finally {
      setQrSaving(false);
    }
  };

  const handleGenerateInvoice = async () => {
    if (!selectedPatient || selectedTests.length === 0) {
      setError("Please select a patient and at least one test.");
      return;
    }

    setError("");
    try {
      const invoice = await createInvoice({
        patientId: selectedPatient,
        items: itemsString,
        amount: finalAmount,
        discount: parseFloat(discount) || 0,
        status: paymentStatus,
        paymentMethod: paymentStatus === 'Paid' ? paymentMethod : '',
      });
      setStatusMessage("Invoice created successfully.");
      setTimeout(() => printInvoice(invoice), 0);
      setSelectedPatient("");
      setSelectedTests([]);
      setDiscount(0);
      setPaymentStatus("Unpaid");
      setPaymentMethod("");
      loadInvoices();
    } catch (err) {
      console.error("Unable to create invoice", err);
      setError(err.message || "Unable to create invoice");
    }
  };

  const handleExportToTally = () => {
    if (invoices.length === 0) {
      alert("No invoices to export.");
      return;
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE>\n  <HEADER>\n    <TALLYREQUEST>Import Data</TALLYREQUEST>\n  </HEADER>\n  <BODY>\n    <IMPORTDATA>\n      <REQUESTDESC>\n        <REPORTNAME>Vouchers</REPORTNAME>\n        <STATICVARIABLES>\n          <SVCURRENTCOMPANY>Smart Lab</SVCURRENTCOMPANY>\n        </STATICVARIABLES>\n      </REQUESTDESC>\n      <REQUESTDATA>\n`;

    invoices.forEach(inv => {
      const dateStr = inv.date ? new Date(inv.date).toISOString().slice(0, 10).replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const patientName = inv.patient_name || 'Cash';
      const cleanName = patientName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n          <VOUCHER VCHTYPE="Sales" ACTION="Create">\n            <DATE>${dateStr}</DATE>\n            <VOUCHERNUMBER>${inv.id}</VOUCHERNUMBER>\n            <PARTYLEDGERNAME>${cleanName}</PARTYLEDGERNAME>\n            <EFFECTIVEDATE>${dateStr}</EFFECTIVEDATE>\n            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>${cleanName}</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n              <AMOUNT>-${inv.amount.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>Laboratory Sales</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n              <AMOUNT>${inv.amount.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n          </VOUCHER>\n        </TALLYMESSAGE>\n`;
    });

    xml += `      </REQUESTDATA>\n    </IMPORTDATA>\n  </BODY>\n</ENVELOPE>`;

    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smart_lab_tally_export_${new Date().toISOString().slice(0, 10)}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusMessage("Tally XML export file generated and downloaded successfully.");
  };

  return (
    <div className="min-h-screen bg-cover bg-center" style={{ backgroundImage: "url('/background.png')" }}>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white/90 backdrop-blur-lg rounded-2xl p-8 shadow-xl mb-8 border border-white/40 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Billing & Accounting</h1>
            <p className="text-gray-600">Automated patient invoicing and Tally integration</p>
          </div>
          <button 
            onClick={handleExportToTally}
            className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-green-700 shadow-lg shadow-green-100 transition"
          >
            <span>📊</span> Export to Tally
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-100 border border-red-200 p-4 text-red-700">
            {error}
          </div>
        )}

        {statusMessage && (
          <div className="mb-6 rounded-lg bg-green-100 border border-green-200 p-4 text-green-700">
            {statusMessage}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <button type="button" onClick={() => navigate("/billing/today")} className="text-left bg-white/90 rounded-2xl p-5 shadow-lg border border-white/40 hover:border-blue-400 hover:shadow-xl transition">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Today total</p>
            <p className="text-2xl font-bold text-blue-700 mt-2">₹{Number(summary.today || 0).toFixed(2)}</p>
            <p className="text-xs text-blue-600 mt-2 font-semibold">Click to view today&apos;s patients</p>
          </button>
          <button type="button" onClick={() => navigate("/billing/summary/month")} className="text-left bg-white/90 rounded-2xl p-5 shadow-lg border border-white/40 hover:border-emerald-400 hover:shadow-xl transition">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">This month</p>
            <p className="text-2xl font-bold text-emerald-700 mt-2">₹{Number(summary.month || 0).toFixed(2)}</p>
            <p className="text-xs text-emerald-600 mt-2 font-semibold">Click for date-wise collection</p>
          </button>
          <button type="button" onClick={() => navigate("/billing/summary/all")} className="text-left bg-white/90 rounded-2xl p-5 shadow-lg border border-white/40 hover:border-gray-400 hover:shadow-xl transition">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">All time billing</p>
            <p className="text-2xl font-bold text-gray-800 mt-2">₹{Number(summary.all || 0).toFixed(2)}</p>
            <p className="text-xs text-gray-600 mt-2 font-semibold">Click for month-wise collection</p>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white/90 rounded-2xl p-6 shadow-lg border border-white/40">
            <h2 className="text-lg font-bold text-gray-800 mb-1">PhonePe QR</h2>
            <p className="text-sm text-gray-500 mb-4">Technician can upload or replace the payment QR.</p>
            <div className="flex flex-col sm:flex-row gap-5 items-start">
              <div className="w-32 h-32 border border-dashed border-gray-300 rounded-xl flex items-center justify-center bg-gray-50 overflow-hidden">
                {paymentQr ? <img src={paymentQr} alt="PhonePe payment QR" className="w-full h-full object-contain" /> : <span className="text-xs text-gray-400 text-center px-2">No QR uploaded</span>}
              </div>
              <div className="space-y-3">
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleQrUpload} className="block w-full text-sm text-gray-600" />
                <button type="button" onClick={handleSaveQr} disabled={qrSaving || !paymentQr} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold disabled:opacity-50">
                  {qrSaving ? "Saving..." : "Save PhonePe QR"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl p-6 border border-white/40">
            <h2 className="text-xl font-bold mb-6 text-gray-800">Billing History</h2>
            {loading ? (
              <p className="text-center text-gray-500">Loading invoices...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">
                      <th className="pb-4">Patient</th>
                      <th className="pb-4">Tests</th>
                      <th className="pb-4">Amount</th>
                      <th className="pb-4">Status</th>
                      <th className="pb-4">Date</th>
                      <th className="pb-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {invoices.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="py-8 text-center text-gray-500">
                          No invoices found.
                        </td>
                      </tr>
                    ) : (
                      invoices.map((bill, i) => (
                        <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                          <td className="py-4 text-gray-800 font-medium">{bill.patient_name || 'Unknown'}</td>
                          <td className="py-4 text-sm text-gray-500 italic">{bill.items}</td>
                          <td className="py-4 font-bold text-gray-800">₹{bill.amount}</td>
                          <td className="py-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              bill.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                            }`}>
                              {bill.status}
                            </span>
                            {bill.status === 'Paid' && bill.payment_method && (
                              <div className="text-[10px] text-gray-500 mt-1 font-semibold">{bill.payment_method}</div>
                            )}
                          </td>
                          <td className="py-4 text-sm text-gray-400">{new Date(bill.date).toLocaleDateString()}</td>
                          <td className="py-4">
                            <div className="flex gap-2 min-w-[190px]">
                              <button type="button" onClick={() => printInvoice(bill)} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 shadow-sm" title="Print invoice">
                                🖨️
                                Print
                              </button>
                              <button type="button" onClick={() => sendInvoiceOnWhatsApp(bill)} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-bold hover:bg-green-700 shadow-sm" title="Send invoice on WhatsApp">
                                💬
                                WhatsApp
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl p-6 border border-white/40 h-fit sticky top-24">
            <h2 className="text-xl font-bold mb-6 text-gray-800">Quick Generate Invoice</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Patient</label>
                <select
                  value={selectedPatient}
                  onChange={(e) => {
                    selectPatient(e.target.value);
                  }}
                  className="w-full mt-1 px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select patient</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.name} ({patient.id})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Tests / Items</label>
                <div className="mt-1 h-32 overflow-y-auto border border-gray-200 rounded-xl p-2 bg-white">
                  {Object.keys(LAB_TESTS_DATA).map((test) => (
                    <label key={test} className="flex items-center gap-2 text-sm p-1 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTests.includes(test)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTests([...selectedTests, test]);
                          } else {
                            setSelectedTests(selectedTests.filter((t) => t !== test));
                          }
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="flex-1 text-gray-800">{test}</span>
                      <span className="text-gray-500 font-medium">₹{LAB_TESTS_DATA[test].mrp}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-200">
                <span className="text-sm font-bold text-gray-600">Subtotal:</span>
                <span className="text-sm font-bold text-gray-800">₹{subTotal}</span>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Discount (₹)</label>
                <input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="Discount amount"
                  className="w-full mt-1 px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Payment Status</label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                  className="w-full mt-1 px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Unpaid">Unpaid</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>
              {paymentStatus === "Paid" && (
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full mt-1 px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Method</option>
                    <option value="Cash">Cash</option>
                    <option value="Online">Online</option>
                  </select>
                </div>
              )}
              <div className="flex justify-between items-center bg-blue-50 p-4 rounded-xl border border-blue-100">
                <span className="text-base font-bold text-blue-800">Final Amount:</span>
                <span className="text-lg font-bold text-blue-700">₹{finalAmount}</span>
              </div>
              <button
                className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 shadow-xl shadow-blue-100 transition"
                onClick={handleGenerateInvoice}
              >
                Create Invoice
              </button>
              <p className="text-center text-[10px] text-gray-400 italic">
                Generated invoices sync to the lab accounting ledger immediately.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Billing;
