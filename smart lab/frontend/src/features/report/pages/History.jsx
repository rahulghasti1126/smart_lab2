import { useEffect, useState } from 'react';
import Navbar from '../../components/Navbar';
import { downloadReportPdf, getDailyHistory } from '../services/api';

const indiaDate = () => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value: part }) => [type, part]));
  return `${value.year}-${value.month}-${value.day}`;
};

const time = (value) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
const reportClass = (status) => status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800';

export default function History() {
  const [date, setDate] = useState(indiaDate);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getDailyHistory(date)
      .then((data) => { if (active) setHistory(data); })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date]);

  const download = async (id) => {
    setDownloading(id); setError('');
    try { await downloadReportPdf(id); } catch (downloadError) { setError(downloadError.message); } finally { setDownloading(''); }
  };

  const summary = history?.summary || {};
  const cards = [
    ['Patients registered', summary.patientsRegistered || 0, 'text-blue-700 bg-blue-50'],
    ['Samples collected', summary.samplesCollected || 0, 'text-violet-700 bg-violet-50'],
    ['Results received', summary.resultsReceived || 0, 'text-amber-700 bg-amber-50'],
    ['Reports approved', `${summary.reportsApproved || 0}/${summary.reportsGenerated || 0}`, 'text-emerald-700 bg-emerald-50'],
  ];

  return <div className="min-h-screen bg-slate-50">
    <Navbar />
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-bold tracking-widest text-blue-700">DAILY PATIENT HISTORY</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Date-wise patients and reports</h1>
          <p className="mt-2 text-slate-600">त्या दिवशी register झालेले patients, samples, results आणि reports एकाच ठिकाणी पहा.</p>
        </div>
        <label className="text-sm font-semibold text-slate-700">Select date
          <input aria-label="Select history date" type="date" value={date} max={indiaDate()} onChange={(event) => setDate(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm" />
        </label>
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, colors]) => <div key={label} className={`rounded-2xl p-5 ${colors}`}><p className="text-sm font-medium">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p></div>)}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b bg-slate-50 px-6 py-4 flex items-center justify-between"><h2 className="font-bold text-slate-900">Patient activity — {date}</h2><span className="text-sm text-slate-500">{history?.patients?.length || 0} patient(s)</span></div>
        {loading ? <div className="p-10 text-center text-slate-500">Loading daily history…</div> : !history?.patients?.length ? <div className="p-10 text-center text-slate-500">या तारखेला patient, sample, result किंवा report activity नाही.</div> : <div className="divide-y divide-slate-200">
          {history.patients.map((patient) => <article key={patient.id} className="p-6 space-y-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div><div className="flex items-center gap-2"><h3 className="text-lg font-bold text-slate-900">{patient.name || 'Unnamed patient'}</h3>{patient.registeredToday && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">NEW TODAY</span>}</div><p className="mt-1 text-sm text-slate-600">Patient ID: <span className="font-mono font-semibold">{patient.id}</span> · {patient.age ?? '-'} years · {patient.gender || '-'} · {patient.phone || 'No mobile'}</p><p className="text-sm text-slate-500">Doctor: {patient.doctor || '-'} · Registration: {time(patient.date)}</p></div>
              <div className="text-sm text-slate-500">Samples: {patient.samples.length} · Results: {patient.results.length} · Reports: {patient.reports.length}</div>
            </div>

            {!!patient.samples.length && <div><p className="mb-2 text-xs font-bold tracking-wide text-slate-500">SAMPLES COLLECTED</p><div className="flex flex-wrap gap-2">{patient.samples.map((sample) => <span key={sample._id} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 font-mono text-sm text-violet-900">{sample.sample_id} <span className="font-sans text-xs">· {sample.status}</span></span>)}</div></div>}

            {!!patient.results.length && <div><p className="mb-2 text-xs font-bold tracking-wide text-slate-500">RESULTS RECEIVED</p><div className="grid gap-2 md:grid-cols-2">{patient.results.map((result) => <div key={result._id} className="rounded-lg border border-slate-200 p-3 text-sm"><span className="font-semibold text-slate-800">{result.test_name || result.test_code}</span><span className="ml-2 font-bold text-slate-900">{result.result_value} {result.unit}</span><span className="ml-2 text-slate-500">Ref: {result.reference_range || '-'}</span><span className="float-right text-xs text-slate-500">{result.status}</span></div>)}</div></div>}

            {!!patient.reports.length && <div><p className="mb-2 text-xs font-bold tracking-wide text-slate-500">REPORTS GENERATED</p><div className="space-y-2">{patient.reports.map((report) => <div key={report._id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"><div><span className="font-mono font-semibold text-slate-900">{report.id}</span><span className={`ml-2 rounded-full px-2 py-1 text-xs font-bold ${reportClass(report.status)}`}>{report.status}</span><p className="mt-1 text-sm text-slate-500">{report.report_type || 'Laboratory report'} · {time(report.generated_at)}</p></div><button onClick={() => download(report.id)} disabled={downloading === report.id} className="rounded-lg border border-blue-600 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50">{downloading === report.id ? 'Downloading…' : 'Download PDF'}</button></div>)}</div></div>}
          </article>)}
        </div>}
      </section>
    </main>
  </div>;
}
