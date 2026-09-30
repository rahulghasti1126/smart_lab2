import React, { useEffect, useState } from "react";
import Navbar from "../../components/Navbar";
import { getMachineMessages, getMachineResults } from "../../report/services/api";
import socket from "../../../app/socket";

export default function MachineResults() {
  const [messages, setMessages] = useState([]);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const onRawMessage = (rawRecord) => {
      if (rawRecord?._id) setMessages((current) => [rawRecord, ...current.filter((item) => item._id !== rawRecord._id)]);
    };
    Promise.all([getMachineMessages(), getMachineResults()])
      .then(([messageRows, resultRows]) => {
        setMessages(messageRows);
        setResults(resultRows);
      })
      .catch((loadError) => setError(loadError.message));
    socket.on("machine-raw-message-received", onRawMessage);
    return () => socket.off("machine-raw-message-received", onRawMessage);
  }, []);

  return (
    <div className="min-h-screen bg-cover bg-center" style={{ backgroundImage: "url('/background.png')" }}>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <header className="bg-white/90 rounded-2xl p-6 shadow-xl"><h1 className="text-3xl font-bold text-gray-800">Machine Results</h1><p className="text-gray-600 mt-2">Raw messages and parsed analyzer records for review.</p></header>
        {error && <div className="bg-red-50 text-red-700 rounded-lg p-4">{error}</div>}
        <section className="bg-white/95 rounded-2xl p-6 shadow-xl overflow-x-auto">
          <h2 className="text-xl font-bold mb-4">Parsed Results</h2>
          <table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Analyzer</th><th className="p-2">Sample ID</th><th className="p-2">Order</th><th className="p-2">Received</th><th className="p-2">Status</th><th className="p-2">Parameters</th></tr></thead><tbody>{results.map((result) => <tr key={result._id} className="border-b"><td className="p-2">{result.analyzer_name}</td><td className="p-2">{result.sample_id || "-"}</td><td className="p-2">{result.order_id || "-"}</td><td className="p-2">{result.received_at ? new Date(result.received_at).toLocaleString() : "-"}</td><td className="p-2">{result.processing_status}</td><td className="p-2"><pre className="max-w-md whitespace-pre-wrap">{JSON.stringify(result.parameters || {}, null, 2)}</pre></td></tr>)}</tbody></table>
          {!results.length && <p className="text-gray-600">No parsed machine results.</p>}
        </section>
        <section className="bg-white/95 rounded-2xl p-6 shadow-xl overflow-x-auto"><h2 className="text-xl font-bold mb-4">Raw Messages / Debug</h2><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Analyzer</th><th className="p-2">Source IP</th><th className="p-2">Connection time</th><th className="p-2">Received</th><th className="p-2">Bytes</th><th className="p-2">Status</th><th className="p-2">Raw message</th><th className="p-2">Escaped raw message</th><th className="p-2">Error</th></tr></thead><tbody>{messages.map((message) => <tr key={message._id} className="border-b align-top"><td className="p-2">{message.analyzer_name}</td><td className="p-2">{message.analyzer_ip}</td><td className="p-2">{message.connection_at ? new Date(message.connection_at).toLocaleString() : "-"}</td><td className="p-2">{new Date(message.received_at).toLocaleString()}</td><td className="p-2">{message.raw_byte_length ?? "-"}</td><td className="p-2">{message.processing_status}</td><td className="p-2"><pre className="max-w-lg whitespace-pre-wrap break-all">{message.raw_message}</pre></td><td className="p-2"><pre className="max-w-lg whitespace-pre-wrap break-all">{message.raw_escaped || JSON.stringify(message.raw_message)}</pre></td><td className="p-2 text-red-700">{message.error || "-"}</td></tr>)}</tbody></table>{!messages.length && <p className="text-gray-600">No machine messages.</p>}</section>
      </main>
    </div>
  );
}
