import React, { useEffect, useState } from "react";
import Navbar from "../../components/Navbar";
import {
  createAnalyzer,
  getAnalyzers,
  simulateAnalyzerMessage,
  testAnalyzerConnection,
  connectAnalyzer,
  disconnectAnalyzer,
} from "../../report/services/api";
import socket from "../../../app/socket";

const initialForm = {
  name: "Cippoint",
  model: "Cippoint Immunofluorescence Quantitative Analyzer",
  ipAddress: "192.168.1.12",
  serverIp: "192.168.1.10",
  port: "8001",
  protocol: "HL7",
  tcpMode: "SERVER",
  autoConnect: false,
  autoReceive: true,
  simulatorMessage: "",
  enabled: false,
};

export default function MachineIntegration() {
  const [form, setForm] = useState(initialForm);
  const [analyzers, setAnalyzers] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);

  const loadAnalyzers = async () => setAnalyzers(await getAnalyzers());

  useEffect(() => {
    loadAnalyzers().catch((loadError) => setError(loadError.message));
    const onStatus = ({ status, details, error: statusError }) => {
      if (status === "ERROR") setError(statusError || details?.error || "TCP listener error");
      else setMessage(`Cippoint listener: ${status}${details?.host ? ` (${details.host})` : ""}`);
      loadAnalyzers().catch((loadError) => setError(loadError.message));
    };
    socket.on("machine-integration-status", onStatus);
    return () => socket.off("machine-integration-status", onStatus);
  }, []);

  const updateField = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  };

  const saveAnalyzer = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await createAnalyzer({ ...form, port: Number(form.port) });
      setMessage("Analyzer configuration saved.");
      await loadAnalyzers();
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  const testConnection = async (id) => {
    setTesting(true);
    setError("");
    try {
      const result = await testAnalyzerConnection(id);
      setMessage(result.status);
      await loadAnalyzers();
    } catch (connectionError) {
      setError(connectionError.message);
    } finally {
      setTesting(false);
    }
  };

  const startListener = async (id) => {
    setError("");
    try {
      const result = await connectAnalyzer(id);
      setMessage(`${result.status}: ${result.message || "Listener starting"}`);
      await loadAnalyzers();
    } catch (connectionError) {
      setError(connectionError.message);
    }
  };

  const stopListener = async (id) => {
    setError("");
    try {
      const result = await disconnectAnalyzer(id);
      setMessage(result.status);
      await loadAnalyzers();
    } catch (disconnectError) {
      setError(disconnectError.message);
    }
  };

  const runSimulator = async (id) => {
    setError("");
    try {
      await simulateAnalyzerMessage(id, { rawMessage: form.simulatorMessage });
      setMessage("Simulator message received and stored.");
    } catch (simulationError) {
      setError(simulationError.message);
    }
  };

  return (
    <div className="min-h-screen bg-cover bg-center" style={{ backgroundImage: "url('/background.png')" }}>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <header className="bg-white/90 rounded-2xl p-6 shadow-xl">
          <h1 className="text-3xl font-bold text-gray-800">Machine Integration</h1>
          <p className="text-gray-600 mt-2">Cippoint LIS TCP server: 0.0.0.0:8001</p>
        </header>

        {(message || error) && <div className={`rounded-lg p-4 ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{error || message}</div>}

        <section className="bg-white/95 rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-bold mb-4">Add Analyzer</h2>
          <form onSubmit={saveAnalyzer} className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {["name", "model", "ipAddress", "serverIp", "port"].map((field) => (
              <label key={field} className="text-sm font-semibold text-gray-700">
                {field === "ipAddress" ? "Analyzer IP address" : field === "serverIp" ? "LIS/server IP" : field}
                <input name={field} value={form[field]} onChange={updateField} type={field === "port" ? "number" : "text"} required className="mt-1 w-full p-3 border rounded-lg" />
              </label>
            ))}
            <label className="text-sm font-semibold text-gray-700">Communication protocol
              <select name="protocol" value={form.protocol} onChange={updateField} className="mt-1 w-full p-3 border rounded-lg">
                <option value="MANUFACTURER_SPECIFIC">Manufacturer specific</option>
                <option value="GP11">GP11</option>
                <option value="ASTM">ASTM</option>
                <option value="HL7">HL7</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-gray-700">TCP mode
              <select name="tcpMode" value={form.tcpMode} onChange={updateField} className="mt-1 w-full p-3 border rounded-lg"><option value="CLIENT">Client</option><option value="SERVER">Server</option></select>
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input name="enabled" type="checkbox" checked={form.enabled} onChange={updateField} /> Enable analyzer
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700"><input name="autoConnect" type="checkbox" checked={form.autoConnect} onChange={updateField} /> Auto connect</label>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700"><input name="autoReceive" type="checkbox" checked={form.autoReceive} onChange={updateField} /> Auto receive</label>
            <label className="text-sm font-semibold text-gray-700 md:col-span-2">Simulator raw HL7 message<textarea name="simulatorMessage" value={form.simulatorMessage} onChange={updateField} className="mt-1 w-full p-3 border rounded-lg" rows="4" placeholder="Paste a sanitized HL7 message" /></label>
            <button className="bg-blue-600 text-white rounded-lg px-4 py-3 font-semibold">Save Analyzer</button>
          </form>
        </section>

        <section className="bg-white/95 rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-bold mb-4">Configured Analyzers</h2>
          <div className="space-y-3">
            {analyzers.map((analyzer) => (
              <div key={analyzer._id} className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div><strong>{analyzer.name}</strong><div className="text-sm text-gray-600">Analyzer IP: {analyzer.ip_address} · LIS Server IP: {analyzer.server_ip} · Listening Port: {analyzer.port} · {analyzer.protocol} · TCP {analyzer.tcp_mode}</div><div className="mt-1 font-bold">Status: {analyzer.connection_status}</div></div>
                <div className="flex flex-wrap gap-2"><button disabled={testing} onClick={() => testConnection(analyzer._id)} className="border border-blue-600 text-blue-700 rounded-lg px-3 py-2">Test Connection</button><button onClick={() => startListener(analyzer._id)} className="bg-green-600 text-white rounded-lg px-3 py-2">Connect</button><button onClick={() => stopListener(analyzer._id)} className="bg-red-600 text-white rounded-lg px-3 py-2">Disconnect</button><button onClick={() => runSimulator(analyzer._id)} className="bg-gray-800 text-white rounded-lg px-3 py-2">Simulator</button></div>
              </div>
            ))}
            {!analyzers.length && <p className="text-gray-600">No analyzer configured yet.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
