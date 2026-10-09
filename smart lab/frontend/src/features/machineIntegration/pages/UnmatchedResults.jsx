import React, { useEffect, useState } from 'react';
import Navbar from '../../components/Navbar';
import { getUnmatchedMachineResults, resolveUnmatchedMachineResult } from '../../report/services/api';

export default function UnmatchedResults() {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [sampleId, setSampleId] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = () => getUnmatchedMachineResults().then(setRows).catch((loadError) => setError(loadError.message));

  useEffect(() => { load(); }, []);

  const resolve = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await resolveUnmatchedMachineResult(selected._id, { sampleId, reason });
      setMessage(`Result manually matched to ${sampleId}. It is now pending validation.`);
      setSelected(null); setSampleId(''); setReason('');
      load();
    } catch (resolveError) { setError(resolveError.message); }
  };

  return <div className="min-h-screen bg-slate-50"><Navbar />
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <header className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6">
        <p className="text-xs font-bold tracking-widest text-amber-600">EXCEPTION QUEUE</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Unmatched analyzer results</h1>
        <p className="mt-2 text-slate-600">Unknown Sample IDs are never assigned automatically. Resolve only after checking the original tube, order and analyzer message.</p>
      </header>
      {(message || error) && <div className={`rounded-lg p-4 ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>{error || message}</div>}
      <section className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-x-auto">
        <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-4">Received</th><th className="p-4">Analyzer</th><th className="p-4">Received Sample ID</th><th className="p-4">Results</th><th className="p-4"></th></tr></thead>
          <tbody>{rows.map((row) => <tr className="border-t" key={row._id}><td className="p-4">{new Date(row.received_at).toLocaleString()}</td><td className="p-4">{row.analyzer_name}</td><td className="p-4 font-mono">{row.sample_id || row.barcode || 'Not supplied'}</td><td className="p-4"><pre className="max-w-md whitespace-pre-wrap text-xs">{JSON.stringify(row.normalized_results || row.parameters, null, 2)}</pre></td><td className="p-4"><button onClick={() => { setSelected(row); setSampleId(''); setReason(''); }} className="rounded-lg border border-amber-500 px-3 py-2 text-amber-700 font-semibold">Investigate</button></td></tr>)}</tbody>
        </table>{!rows.length && <p className="p-8 text-slate-500">No unmatched analyzer results.</p>}
      </section>
      {selected && <div className="fixed inset-0 bg-slate-950/40 p-4 flex items-center justify-center"><form onSubmit={resolve} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4"><h2 className="text-xl font-bold">Manually resolve result</h2><p className="text-sm text-slate-600">This action is audited and sends the result to validation, not final release.</p><label className="block text-sm font-semibold">Verified Sample ID<input required value={sampleId} onChange={(event) => setSampleId(event.target.value)} className="mt-1 w-full rounded-lg border p-3 font-mono" /></label><label className="block text-sm font-semibold">Reason<input required value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border p-3" placeholder="e.g., barcode label reprinted after accession check" /></label><div className="flex gap-3"><button className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white">Resolve to validation</button><button type="button" onClick={() => setSelected(null)} className="rounded-lg border px-4 py-2">Cancel</button></div></form></div>}
    </main>
  </div>;
}
