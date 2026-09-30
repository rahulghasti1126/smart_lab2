import { useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { generateReport, verifyReport, updateReport, updateResult, getPatients, getResults } from "../services/api";

// Helper: keyword-based lookup from real machine results
const findResult = (results, keywords) =>
  results.find(r => keywords.some(k => r.test_name.toLowerCase().includes(k.toLowerCase())));

const getResult = (results, keywords) =>
  results.find(r => keywords.some(k => r.test_name.toLowerCase().includes(k.toLowerCase())));

const getVal = (results, keywords) => {
  const r = findResult(results, keywords);
  return r ? r.result_value : null;
};

const getStat = (results, keywords, val, min, max) => {
  const r = findResult(results, keywords);
  if (r && r.status) return r.status;
  const n = parseFloat(val);
  if (!isNaN(n)) {
    if (n < min) return "Low";
    if (n > max) return "High";
    return "Normal";
  }
  return "Normal";
};

const fillHaemogramParameters = (existingResults) => {
  // Map all machine result values — no hardcoded defaults
  const hbResult   = getResult(existingResults, ["hemoglobin", "haemoglobin", "hb"]);
  const rbcResult  = getResult(existingResults, ["rbc", "red blood cell"]);
  const pcvResult  = getResult(existingResults, ["pcv", "pack cell", "hematocrit", "hct"]);
  const mcvResult  = getResult(existingResults, ["mcv"]);
  const mchResult  = getResult(existingResults, ["mch ", " mch", "mean corpuscular hemo"]);
  const mchcResult = getResult(existingResults, ["mchc"]);
  const rdwcvResult= getResult(existingResults, ["rdw-cv", "rdw cv", "rdwcv"]);
  const rdwsdResult= getResult(existingResults, ["rdw-sd", "rdw sd", "rdwsd"]);
  const wbcResult  = getResult(existingResults, ["wbc", "white blood cell", "leukocyte", "tlc"]);
  const neutResult = getResult(existingResults, ["neutro", "neut"]);
  const lymphResult= getResult(existingResults, ["lympho", "lymph"]);
  const eosinoResult= getResult(existingResults, ["eosino", "eos"]);
  const monoResult = getResult(existingResults, ["mono"]);
  const basoResult = getResult(existingResults, ["baso"]);
  const pltResult  = getResult(existingResults, ["platelet", "plt", "thrombocyte"]);
  const pctResult  = getResult(existingResults, ["pct"]);
  const mpvResult  = getResult(existingResults, ["mpv"]);
  const pdwResult  = getResult(existingResults, ["pdw"]);

  // Build rows — only include rows where we have a real value, or keep structure with "---" to show missing
  const row = (name, result, unit, range, min, max, keywords) => ({
    name,
    value: result?.result_value ?? "---",
    resultId: result?.id,
    unit,
    range,
    status: result?.result_value ? getStat(existingResults, keywords, result.result_value, min, max) : "---",
  });

  return [
    row("HAEMOGLOBIN",    hbResult,    "gms%",        "Male: 13.5-17  Female: 11.5-16", 11.5, 17,    ["hemoglobin","haemoglobin","hb"]),
    row("R.B.C COUNT",    rbcResult,   "millions/µL", "4.5 - 5.5",    4.0, 5.5,  ["rbc","red blood cell"]),
    row("PACK CELL VOLUME (PCV)", pcvResult, "%",     "40 - 54",      40,  54,   ["pcv","pack cell","hematocrit","hct"]),
    row("MCV",            mcvResult,   "fL",          "76 - 94",      76,  94,   ["mcv"]),
    row("MCH",            mchResult,   "Pg",          "27 - 34",      27,  34,   ["mch"]),
    row("MCHC",           mchcResult,  "g/dL",        "32 - 37",      32,  37,   ["mchc"]),
    row("RDW-CV",         rdwcvResult, "%",           "11.0 - 16.0",  11,  16,   ["rdw-cv","rdw cv","rdwcv"]),
    row("RDW-SD",         rdwsdResult, "fL",          "35 - 56",      35,  56,   ["rdw-sd","rdw sd","rdwsd"]),
    row("W.B.C. COUNT",   wbcResult,   "cells/cumm",  "4000 - 11000", 4000,11000,["wbc","white blood cell","leukocyte","tlc"]),
    { isSubheading: true, name: "DIFFERENTIAL COUNT" },
    row("NEUTROPHILS",    neutResult,  "%",           "40 - 75",      40,  75,   ["neutro","neut"]),
    row("LYMPHOCYTES",    lymphResult, "%",           "20 - 45",      20,  45,   ["lympho","lymph"]),
    row("EOSINOPHILS",    eosinoResult,"%",           "0 - 6",        0,   6,    ["eosino","eos"]),
    row("MONOCYTES",      monoResult,  "%",           "2 - 12",       2,   12,   ["mono"]),
    row("BASOPHILS",      basoResult,  "%",           "0 - 1",        0,   1,    ["baso"]),
    row("PLATELET COUNT", pltResult,   "/cumm",       "150000 - 450000", 150000, 450000, ["platelet","plt","thrombocyte"]),
    row("PCT",            pctResult,   "%",           "0.08 - 1.0",   0.08,1.0,  ["pct"]),
    row("MPV",            mpvResult,   "fL",          "7.4 - 10.4",   7.4, 10.4, ["mpv"]),
    row("PDW",            pdwResult,   "%",           "10 - 15",      10,  15,   ["pdw"]),
    { isSubheading: true, name: "SMEAR EXAMINATION" },
    {
      name: "RBC MORPHOLOGY",
      value: getVal(existingResults, ["rbc morphology","rbc morph"]) ?? "NORMOCHROMIC NORMOCYTIC",
      isSmear: true,
    },
    {
      name: "W.B.C MORPHOLOGY",
      value: getVal(existingResults, ["wbc morphology","wbc morph"]) ?? "WITHIN NORMAL LIMIT",
      isSmear: true,
    },
    {
      name: "PLATELETS ON SMEAR",
      value: getVal(existingResults, ["platelets on smear","platelet smear"]) ?? "ADEQUATE ON SMEAR",
      isSmear: true,
    },
  ];
};

const ReportPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const report = location.state;

  const [verified, setVerified] = useState(false);
  const [patientDetails, setPatientDetails] = useState(null);
  const [patientResults, setPatientResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [findings, setFindings] = useState('');
  const [doctorNotes, setDoctorNotes] = useState('');
  const [editedResults, setEditedResults] = useState({});
  const [saving, setSaving] = useState(false);
  const [generatedReportId, setGeneratedReportId] = useState(null);

  useEffect(() => {
    const loadReportData = async () => {
      if (!report) return;
      setLoading(true);
      try {
        const [patients, results] = await Promise.all([getPatients(), getResults()]);
        const patient = patients.find(p => p.id === report.patient_id);
        if (patient) {
          setPatientDetails(patient);
        } else {
          setPatientDetails({
            name: report.patient_name,
            phone: report.phone,
            email: report.email,
            age: "-",
            gender: "-",
            doctor: "Self / General Practitioner"
          });
        }
        const filteredResults = results.filter(r => r.patient_id === report.patient_id);
        setPatientResults(filteredResults);
        setEditedResults(filteredResults.reduce((acc, item) => ({ ...acc, [item.id]: item.result_value }), {}));
        setFindings(report.findings || report.findings || '');
        setDoctorNotes(report.doctor_notes || report.doctorNotes || '');
        setGeneratedReportId(report.id || null);
      } catch (err) {
        console.error("Failed to load report data:", err);
      } finally {
        setLoading(false);
      }
    };
    loadReportData();
  }, [report]);

  const handleVerify = async () => {
    try {
      const result = await generateReport({
        patientId: report.patient_id,
        reportType: report.test_name,
        findings: "Verified",
        doctorNotes: "Clinically correlate.",
      });
      if (result && result.id) await verifyReport(result.id);
      setVerified(true);
    } catch (err) {
      alert("Verification failed: " + err.message);
    }
  };

  if (!report) {
    return <div className="p-10 text-center">No Report Found</div>;
  }

  const handleWhatsAppShare = () => {
    const message = `Medical Lab Report\nPatient: ${patientDetails?.name || report.patient_name}\nTest: ${report.test_name}\nDate: ${report.date}`;
    window.open(`https://wa.me/91${report.phone || patientDetails?.phone}?text=${encodeURIComponent(message)}`);
  };

  const handleSaveReport = async () => {
    const reportId = report?.id || generatedReportId;
    if (!reportId) {
      return alert('Unable to save report without report id.');
    }

    setSaving(true);
    try {
      const changedResults = patientResults.filter((item) => editedResults[item.id] !== undefined && editedResults[item.id] !== item.result_value);
      await Promise.all(changedResults.map((item) => updateResult({ id: item.id, resultValue: editedResults[item.id] })));
      await updateReport({
        id: reportId,
        findings,
        doctorNotes,
      });

      const freshResults = await getResults();
      const filteredResults = freshResults.filter((item) => item.patient_id === report.patient_id);
      setPatientResults(filteredResults);
      setEditedResults(filteredResults.reduce((acc, item) => ({ ...acc, [item.id]: item.result_value }), {}));
      setGeneratedReportId(reportId);
      setEditMode(false);
      alert('Report saved successfully.');
    } catch (err) {
      console.error('Failed to update report:', err);
      alert('Unable to save report.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setFindings(report.findings || report.findings || '');
    setDoctorNotes(report.doctor_notes || report.doctorNotes || '');
    setEditedResults(patientResults.reduce((acc, item) => ({ ...acc, [item.id]: item.result_value }), {}));
  };

  const handleEmailShare = () => {
    const subject = "Your Medical Lab Report";
    const body = `Report for ${patientDetails?.name || report.patient_name}`;
    window.location.href = `mailto:${report.email || patientDetails?.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  const testType = patientDetails?.test_type || report.patient_test_type || report.test_name || report.report_type || "Diagnostic Report";

  const getTestTitle = (type) => {
    const t = type.toLowerCase();
    if (t.includes("cbc") || t.includes("haemogram")) return "HAEMOGRAM";
    if (t.includes("blood sugar") || t.includes("glucose")) return "BLOOD SUGAR REPORT";
    if (t.includes("lipid")) return "LIPID PROFILE";
    if (t.includes("liver") || t.includes("lft")) return "LIVER FUNCTION REPORT";
    if (t.includes("kidney") || t.includes("kft")) return "KIDNEY FUNCTION REPORT";
    return type.toUpperCase();
  };

  const testTitle = getTestTitle(testType);
  const isCbc = testTitle === "HAEMOGRAM";

  const parameters = isCbc ? fillHaemogramParameters(patientResults) : patientResults.map(r => ({
    name: r.test_name.toUpperCase(),
    value: editedResults[r.id] !== undefined ? editedResults[r.id] : r.result_value,
    resultId: r.id,
    unit: r.unit || "",
    range: r.reference_range || "Normal",
    status: r.status || "Normal"
  }));

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4 flex flex-col items-center">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white !important; margin: 0 !important; }
          .no-print { display: none !important; }
          .report-print-container { box-shadow: none !important; border: none !important; margin: 0 !important; width: 100% !important; }
        }
      `}} />
      <div className="w-full max-w-[800px] bg-white shadow-2xl border border-slate-200 p-8 flex flex-col report-print-container relative">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <div className="text-4xl text-[#0055a5]">
              <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 18h8" /> <path d="M3 22h18" /> <path d="M14 22a7 7 0 1 0-14 0" /> <path d="M12 2v10" /> <path d="M17 12a5 5 0 0 0-5-5" /> <path d="m14 10 3 3" /> <path d="M9 14h2" />
              </svg>
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black tracking-tight text-[#0055a5]">AS</span>
                <span className="text-3xl font-bold tracking-tight text-slate-800">DIAGNOSTICS</span>
              </div>
              <p className="text-[10px] font-bold text-slate-700 tracking-wide mt-0.5">
                CMC EXTERNAL QUALITY ASSURANCE SCHEME <span className="font-normal text-slate-500">(Under aegis of ACBI)</span>
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-14 h-14 rounded-full border-2 border-[#0055a5]/30 flex flex-col items-center justify-center text-[7px] text-[#0055a5] font-bold p-1 text-center select-none">
              <span className="text-[8px] font-black">CMC</span><span>EQAS</span><span>MEMBER</span>
            </div>
            <div className="w-14 h-14 rounded-full border-2 border-[#0055a5] flex flex-col items-center justify-center text-[6px] text-[#0055a5] font-bold p-1 text-center select-none relative">
              <div className="absolute inset-0.5 rounded-full border border-dashed border-[#0055a5]/40"></div>
              <span className="text-[7px] font-black mb-0.5">ISO</span><span>9001:2015</span>
            </div>
          </div>
        </div>
        <div className="h-6 bg-[#0055a5] relative flex items-center justify-between overflow-hidden rounded-sm mb-4">
          <div className="flex gap-1 h-full transform -skew-x-[25deg] -translate-x-4">
            <div className="w-3 bg-white h-full opacity-30"></div><div className="w-1 bg-white h-full opacity-30"></div><div className="w-1 bg-white h-full opacity-30"></div>
          </div>
          <div className="flex gap-1 h-full transform skew-x-[25deg] translate-x-4">
            <div className="w-1 bg-white/20 h-full"></div><div className="w-1 bg-white/20 h-full"></div><div className="w-3 bg-white/20 h-full"></div>
          </div>
        </div>
        <div className="border-y border-slate-400 py-3 my-2 text-xs font-bold uppercase text-slate-800 grid grid-cols-[1.2fr_1.8fr_1fr_1fr] gap-y-2">
          <div className="text-slate-500">NAME</div><div>: {patientDetails?.name || report.patient_name}</div><div className="text-slate-500">AGE</div><div>: {patientDetails?.age ?? '22'} Yrs.</div>
          <div className="text-slate-500">REF. BY</div><div>: {patientDetails?.doctor || 'SELF'}</div><div className="text-slate-500">SEX</div><div>: {patientDetails?.gender || '-'}</div>
          <div className="col-span-2"></div><div className="text-slate-500">DATE</div><div>: {formatDate(report.date)}</div>
        </div>
        <div className="text-center my-4">
          <h2 className="text-base font-extrabold tracking-widest text-slate-900 pb-1 inline-block px-10">{testTitle}</h2>
        </div>
        <div className="flex-1 my-2">
          <div className="grid grid-cols-[2.5fr_0.2fr_1.2fr_1.2fr_2.5fr] text-[11px] font-bold text-slate-800 uppercase tracking-wider pb-1.5 border-b-2 border-slate-700 mb-2">
            <div>Test Parameter</div><div></div><div>Result</div><div>Unit</div><div className="text-right">Normal Range</div>
          </div>
          <div className="space-y-1.5">
            {loading ? <div className="text-center py-10 font-semibold text-slate-500">Loading...</div> : parameters.map((p, i) => {
              if (p.isSubheading) return <div key={i} className="pt-2 pb-0.5 border-b border-slate-200"><span className="text-[11px] font-extrabold text-slate-900 underline tracking-wider">{p.name}</span></div>;
              if (p.isSmear) return <div key={i} className="grid grid-cols-[2.5fr_0.2fr_5fr] text-[11px] py-0.5 text-slate-800 font-medium"><div className="font-bold text-slate-700">{p.name}</div><div className="text-center text-slate-400">:</div><div className="font-bold text-slate-900">{p.value}</div></div>;
              const isRed = p.status === "Low" || p.status === "High";
              const editableValue = editedResults[p.resultId] !== undefined ? editedResults[p.resultId] : p.value;
              return <div key={i} className="grid grid-cols-[2.5fr_0.2fr_1.2fr_1.2fr_2.5fr] text-[11px] py-0.5 text-slate-800 font-medium items-baseline"><div className="font-bold text-slate-700">{p.name}</div><div className="text-center text-slate-400">:</div><div className={`font-extrabold ${isRed ? "text-red-600" : "text-slate-900"}`}>{editMode && p.resultId ? <input
                type="text"
                value={editableValue}
                onChange={(e) => setEditedResults((prev) => ({ ...prev, [p.resultId]: e.target.value }))}
                className="w-full bg-white border border-slate-300 rounded-md px-2 py-1 text-sm text-slate-900"
              /> : p.value}</div><div className="text-slate-500 font-semibold">{p.unit}</div><div className="text-right text-slate-500 text-[10px] font-semibold">{p.range}</div></div>;
            })}
          </div>
        </div>
        <div className="mt-6 border border-slate-200 rounded-2xl bg-slate-50 p-5">
          <div className="grid gap-4">
            <div>
              <div className="text-xs uppercase font-bold text-slate-500 mb-2">Findings</div>
              {editMode ? (
                <textarea
                  className="w-full min-h-[120px] p-3 border rounded-xl text-sm"
                  value={findings}
                  onChange={(e) => setFindings(e.target.value)}
                />
              ) : (
                <p className="text-slate-700 whitespace-pre-wrap">{findings || 'No findings available.'}</p>
              )}
            </div>
            <div>
              <div className="text-xs uppercase font-bold text-slate-500 mb-2">Doctor Notes</div>
              {editMode ? (
                <textarea
                  className="w-full min-h-[100px] p-3 border rounded-xl text-sm"
                  value={doctorNotes}
                  onChange={(e) => setDoctorNotes(e.target.value)}
                />
              ) : (
                <p className="text-slate-700 whitespace-pre-wrap">{doctorNotes || 'No notes provided.'}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 justify-center mt-4 no-print">
          {editMode ? (
            <>
              <button
                onClick={handleSaveReport}
                disabled={saving}
                className="px-6 py-3 bg-emerald-600 text-white rounded-xl shadow-lg hover:bg-emerald-700 font-bold text-xs"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={handleCancelEdit}
                className="px-6 py-3 bg-gray-300 text-slate-900 rounded-xl shadow-lg hover:bg-gray-400 font-bold text-xs"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditMode(true)}
              className="px-6 py-3 bg-yellow-500 text-white rounded-xl shadow-lg hover:bg-yellow-600 font-bold text-xs"
            >
              Edit Report
            </button>
          )}
        </div>
        <div className="text-center my-6"><p className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">----- End Of Report -----</p></div>
        <div className="flex justify-end mt-4 select-none">
          <div className="relative border border-blue-600/30 rounded-xl px-6 py-2 text-center bg-blue-50/5 transform rotate-[-1.5deg] min-w-[200px]">
            <span className="font-serif italic text-blue-800 font-bold text-sm block mb-0.5">Dr. Shubhangi M. Patil</span>
            <span className="text-[8px] text-blue-700 font-extrabold block uppercase tracking-wider">M.D. Pathologist</span>
            {verified && <img src="/digital-sign.png" alt="Digital Signature" className="absolute inset-0 m-auto h-16 w-32 object-contain opacity-85 pointer-events-none transform rotate-[4deg]" />}
          </div>
        </div>
        <div className="bg-[#1e293b] text-white py-3 px-6 mt-8 flex flex-col md:flex-row justify-between items-center text-[10px] font-bold uppercase tracking-wider relative overflow-hidden rounded-sm">
          <div className="z-10 text-center md:text-left text-slate-200">Old Dr. S.M. Patil Hospital, Near Mohite Petrol Pump, Ajara Road, Gadhinglaj.</div>
          <div className="z-10 mt-1 md:mt-0 text-slate-200">📞 07218 682 219</div>
        </div>
      </div>
      <div className="w-full max-w-[800px] mt-6 flex flex-wrap gap-3 justify-center no-print">
        <button onClick={handleVerify} disabled={verified || loading} className="px-6 py-3 bg-[#1e293b] text-white rounded-xl shadow-lg hover:bg-slate-800 font-bold text-xs">Verify Report</button>
        <button onClick={handleWhatsAppShare} className="px-6 py-3 bg-emerald-600 text-white rounded-xl shadow-lg hover:bg-emerald-700 font-bold text-xs">WhatsApp</button>
        <button onClick={handleEmailShare} className="px-6 py-3 bg-violet-600 text-white rounded-xl shadow-lg hover:bg-violet-700 font-bold text-xs">Email</button>
        <button onClick={() => window.print()} className="px-6 py-3 bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 font-bold text-xs">Print</button>
        <button onClick={() => navigate(-1)} className="px-6 py-3 bg-rose-600 text-white rounded-xl shadow-lg hover:bg-rose-700 font-bold text-xs">Back</button>
      </div>
    </div>
  );
};

export default ReportPage;