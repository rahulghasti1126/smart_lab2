import React, { useState, useEffect } from "react";
import Navbar from "../../components/Navbar";
import { useNavigate } from "react-router-dom";
import {
  addPatient,
  getPatients,
  getResults,
  generateReport,
  getPorts,
  connectMachine as connectMachineAPI,
  connectMachineNetwork,
  disconnectMachine,
  startMachine,
  stopMachine,
  getPortStatus,
  addPatientTest
} from "../services/api";
import socket from "../../../app/socket";
import { LAB_TESTS_DATA } from "../constants";
const Patient = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    patientName: "",
    age: "",
    gender: "",
    doctor: "",
    phone: "",
    email: "",
  });

  const [selectedPatientProfile, setSelectedPatientProfile] = useState(null);
  const [newTestType, setNewTestType] = useState("");

  const [patients, setPatients] = useState([]);
  const [machineStatusMap, setMachineStatusMap] = useState({});
  const [machineConnectedMap, setMachineConnectedMap] = useState({});
  const [testResults, setTestResults] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [ports, setPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [baudRate, setBaudRate] = useState(9600);
  const [connectionStatus, setConnectionStatus] = useState("Disconnected");
  const [connectionLogs, setConnectionLogs] = useState([]);
  const [delimiter, setDelimiter] = useState("\\r\\n");
  const [activeTestConnection, setActiveTestConnection] = useState(null);
  
  const [connectionMode, setConnectionMode] = useState("serial"); // 'serial' | 'network'
  const [networkHost, setNetworkHost] = useState("");
  const [networkPort, setNetworkPort] = useState("");

  useEffect(() => {
    if (activeTestConnection) {
      const activeTest = testResults.find(t => t.id === activeTestConnection);
      if (activeTest && (activeTest.test_name.toLowerCase().includes("cbc") || activeTest.machine_name.toLowerCase().includes("cbc"))) {
        setConnectionMode("network");
      } else {
        setConnectionMode("serial");
      }
    }
  }, [activeTestConnection, testResults]);



  const testToMachineMap = Object.keys(LAB_TESTS_DATA).reduce((acc, test) => {
    acc[test] = LAB_TESTS_DATA[test].machine || [];
    return acc;
  }, {});

  const buildMachineConnectionMap = (connected) => {
    const map = {};
    [...new Set(Object.values(testToMachineMap).flat())].forEach((machine) => {
      map[machine] = connected;
    });
    return map;
  };

  useEffect(() => {
    setMachineConnectedMap(buildMachineConnectionMap(false));
  }, []);

  useEffect(() => {
    const syncConnectionState = async () => {
      try {
        const [availablePorts, statusResponse] = await Promise.all([getPorts(), getPortStatus()]);
        setPorts(availablePorts || []);
        if (statusResponse?.status) {
          setConnectionStatus(statusResponse.status);
          setMachineConnectedMap(buildMachineConnectionMap(statusResponse.status === "Connected"));
          setConnectionLogs((prev) => (prev.length ? prev : [{ type: 'info', text: "Analyzer already connected", time: new Date() }]));
        }
      } catch (err) {
        console.error("Failed to sync analyzer status", err);
      }
    };

    syncConnectionState();

    const onMachineConnected = (payload) => {
      setConnectionStatus("Connected");
      setMachineConnectedMap(buildMachineConnectionMap(true));
      setConnectionLogs((prev) => [{ type: 'info', text: `Machine connected: ${payload?.path || "Analyzer"}`, time: new Date() }, ...prev].slice(0, 50));
    };

    const onMachineWaiting = (payload) => {
      setConnectionStatus("Waiting");
      setMachineConnectedMap(buildMachineConnectionMap(false));
      setConnectionLogs((prev) => [{ type: 'info', text: `Port open; waiting for analyzer data: ${payload?.path || "COM port"}`, time: new Date() }, ...prev].slice(0, 50));
    };

    const onMachineError = (err) => {
      setConnectionStatus("Error");
      setMachineConnectedMap(buildMachineConnectionMap(false));
      setConnectionLogs((prev) => [{ type: 'error', text: `Machine error: ${err?.error || JSON.stringify(err)}`, time: new Date() }, ...prev].slice(0, 50));
    };

    const onResult = async (payload) => {
      console.log("🔥 RESULT-CREATED EVENT RECEIVED:", payload);
      setConnectionLogs((prev) => [{ type: 'result', payload, time: new Date() }, ...prev].slice(0, 50));

      try {
        const resultRows = await getResults();
        console.log("🔥 UPDATED RESULTS FROM API:", resultRows);
        setTestResults(resultRows);
      } catch (err) {
        console.error("❌ Failed to refresh results:", err);
      }
    };

    const onRawAnalyzerData = (payload) => {
      setConnectionLogs((prev) => [{ type: 'raw', text: `Raw stream: ${payload?.raw || payload?.data || "No data"}`, time: new Date() }, ...prev].slice(0, 50));
    };

    socket.on("machine-connected", onMachineConnected);
    socket.on("machine-waiting", onMachineWaiting);
    socket.on("machine-error", onMachineError);
    socket.on("result-created", onResult);
    socket.on("raw-analyzer-data", onRawAnalyzerData);

    return () => {
      socket.off("machine-connected", onMachineConnected);
      socket.off("machine-waiting", onMachineWaiting);
      socket.off("machine-error", onMachineError);
      socket.off("result-created", onResult);
      socket.off("raw-analyzer-data", onRawAnalyzerData);
    };
  }, []);

  useEffect(() => {
    const activeUser = localStorage.getItem("activeUser") || localStorage.getItem("user") || "";
    const loadData = async () => {
      setLoading(true);
      try {
        const [patientRows, resultRows] = await Promise.all([getPatients(), getResults()]);
        setPatients(patientRows);
        setTestResults(resultRows);
        setMachineStatusMap({});
      } catch (err) {
        console.error("Failed to load data", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    window.dispatchEvent(new CustomEvent("user:changed", { detail: { user: activeUser } }));
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await addPatient(formData);
      setMessage(`Patient ${response.id} registered successfully`);
      setFormData({
        patientName: "",
        age: "",
        gender: "",
        doctor: "",
        phone: "",
        email: "",
      });
      const updatedPatients = await getPatients();
      setPatients(updatedPatients);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const fetchResults = async () => {
    try {
      const resultRows = await getResults();
      setTestResults(resultRows);
    } catch (err) {
      console.error("Failed to load results", err);
    }
  };

  const openReport = async () => {
    if (!selectedReport) return;
    let routeReport = selectedReport;

    const isResultState = selectedReport.id && /^[0-9a-fA-F]{24}$/.test(selectedReport.id);
    if (isResultState) {
      try {
        const response = await generateReport({
          patientId: selectedReport.patient_id,
          reportType: selectedReport.test_name || selectedReport.report_type || "Diagnostic Report",
          findings: selectedReport.findings || selectedReport.doctor_notes || "",
          doctorNotes: selectedReport.doctor_notes || selectedReport.doctorNotes || "",
        });
        routeReport = {
          ...selectedReport,
          id: response.id,
          report_type: selectedReport.test_name || selectedReport.report_type || "Diagnostic Report",
          findings: selectedReport.findings || "",
          doctor_notes: selectedReport.doctor_notes || selectedReport.doctorNotes || "",
        };
      } catch (err) {
        alert(`Unable to create report: ${err.message}`);
        return;
      }
    }

    navigate("/report", { state: routeReport });
  };

  const fetchAnalyzerPorts = async () => {
    try {
      const data = await getPorts();
      setPorts(data || []);
    } catch (err) {
      console.error("Error fetching ports:", err);
    }
  };

  const connectAnalyzer = async () => {
    try {
      if (connectionMode === "serial") {
        if (!selectedPort) {
          alert("Please select a port first");
          return;
        }
        const res = await connectMachineAPI({ path: selectedPort, baudRate, delimiter });
        setConnectionStatus(res.status || "Waiting");
        setMachineConnectedMap(buildMachineConnectionMap(res.status === "Connected"));
        setConnectionLogs((prev) => [{ type: 'info', text: `Port ${selectedPort} opened at ${baudRate} baud; waiting for analyzer data`, time: new Date() }, ...prev].slice(0, 50));
        if (res?.message) setMessage(res.message);
      } else {
        if (!networkHost || !networkPort) {
          alert("Please enter IP Address and Port");
          return;
        }
        const res = await connectMachineNetwork({ host: networkHost, port: networkPort });
        setConnectionStatus("Connected");
        setMachineConnectedMap(buildMachineConnectionMap(true));
        setConnectionLogs((prev) => [{ type: 'info', text: `Connected to network ${networkHost}:${networkPort}`, time: new Date() }, ...prev].slice(0, 50));
        if (res?.message) setMessage(res.message);
      }
    } catch (err) {
      alert(`Connection failed: ${err.message}`);
    }
  };

  const disconnectAnalyzer = async () => {
    try {
      const res = await disconnectMachine();
      setConnectionStatus("Disconnected");
      setMachineConnectedMap(buildMachineConnectionMap(false));
      setConnectionLogs((prev) => [{ type: 'info', text: `Disconnected: ${res?.message || "manual"}`, time: new Date() }, ...prev].slice(0, 50));
    } catch (err) {
      alert(`Disconnect failed: ${err.message}`);
    }
  };

  const toggleMachine = async (testRecord, patient, status) => {
    // Deprecated: Start/Stop buttons removed as per user request
  };

  const handleAddTest = async () => {
    if (!newTestType || !selectedPatientProfile) return;
    const machines = LAB_TESTS_DATA[newTestType]?.machine || [];
    const machineName = machines.length > 0 ? machines[0] : "";
    
    try {
      await addPatientTest(selectedPatientProfile.id, { testName: newTestType, machineName });
      const updatedResults = await getResults();
      setTestResults(updatedResults);
      setNewTestType("");
      setMessage(`Test ${newTestType} added successfully`);
    } catch (err) {
      alert(`Failed to add test: ${err.message}`);
    }
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center"
      style={{ backgroundImage: "url('/background.png')" }}
    >
      <Navbar />
      <div className="max-w-7xl mx-auto p-6">
        <h1 className="text-4xl font-bold text-skyblue mb-6 drop-shadow">
          Patient Registration & Lab Control
        </h1>

        <div className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl p-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-blue-700">Analyzer Connection</h2>
              <p className="text-gray-600">Connect the analyzer from this page and enable patient machine controls.</p>
            </div>
            <div className={`px-4 py-2 rounded-lg font-semibold ${connectionStatus === "Connected" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
              {connectionStatus}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4 mt-5">
            <div>
              <label className="text-sm font-semibold text-gray-600">Select Port</label>
              <select
                className="w-full mt-2 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
              >
                <option value="">-- Choose Port --</option>
                {ports.map((port, index) => (
                  <option key={`${port.path || "port"}-${index}`} value={port.path}>
                    {port.path} ({port.friendlyName || "Analyzer"})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-600">Baud Rate</label>
              <input
                type="number"
                className="w-full mt-2 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                value={baudRate}
                onChange={(e) => setBaudRate(Number(e.target.value) || 9600)}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-600">Line Delimiter</label>
              <select
                className="w-full mt-2 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value)}
              >
                <option value="\\n">LF (\n)</option>
                <option value="\\r\\n">CRLF (\r\n)</option>
                <option value="\\r">CR (\r)</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <button type="button" onClick={fetchAnalyzerPorts} className="flex-1 bg-gray-100 py-3 rounded-lg font-semibold hover:bg-gray-200">
                Scan Ports
              </button>
              <button type="button" onClick={connectAnalyzer} className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700">
                Connect
              </button>
              <button type="button" onClick={disconnectAnalyzer} className="flex-1 bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700">
                Disconnect
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-gray-900 p-4 text-sm text-green-400 font-mono h-40 overflow-y-auto">
            {connectionLogs.length === 0 ? (
              <p className="opacity-50">Waiting for connection...</p>
            ) : (
              connectionLogs.map((log, index) => {
                if (typeof log === 'string') return <p key={index}>{log}</p>;
                if (log.type === 'result') return <p key={index}>[{log.time.toLocaleTimeString()}] Result: {log.payload.test_name} = {log.payload.result_value}</p>;
                return <p key={index}>[{log.time.toLocaleTimeString()}] {log.text}</p>;
              })
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* FORM */}
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl p-6">
            <h2 className="text-xl font-bold mb-4 text-blue-700">Add New Patient</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                name="patientName"
                placeholder="Patient Name"
                value={formData.patientName}
                onChange={handleChange}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  name="age"
                  placeholder="Age"
                  value={formData.age}
                  onChange={handleChange}
                  className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Gender</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </div>
              <input
                type="tel"
                name="phone"
                placeholder="Phone Number"
                value={formData.phone}
                onChange={handleChange}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                required
                maxLength={10}
                pattern="\d{10}"
                title="Phone number must be 10 digits"
              />
                 <input
                type="email"
                name="email"
                placeholder="Patient Email"
                value={formData.email}
                onChange={handleChange}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
              <input
                type="text"
                name="doctor"
                placeholder="Referring Doctor Name"
                value={formData.doctor}
                onChange={handleChange}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <button className="w-full bg-gradient-to-r from-blue-600 to-teal-500 text-white py-3 rounded-lg font-semibold hover:scale-105 transition">
                Register Patient
              </button>
            </form>
          </div>

          {/* PATIENT TABLE */}
          <div className="lg:col-span-2 bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-blue-700">
              Patient Records & Machine Control
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-lg">
                <thead>
                  <tr className="bg-blue-600 text-white text-left">
                    <th className="p-4">ID</th>
                    <th className="p-4">Name</th>
                    <th className="p-4">Phone</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.length === 0 && (
                    <tr>
                      <td colSpan="8" className="text-center p-6 text-gray-500">
                        No patients registered
                      </td>
                    </tr>
                  )}
                  {patients.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b transition hover:bg-blue-50"
                    >
                      <td className="p-4 font-semibold">{p.id}</td>
                      <td className="p-4">{p.name}</td>
                      <td className="p-4">{p.phone}</td>
                      <td className="p-4">{new Date(p.date).toLocaleDateString()}</td>
                      <td className="p-4">
                        <button
                          type="button"
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold"
                          onClick={() => setSelectedPatientProfile(p)}
                        >
                          Open Profile
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* PATIENT PROFILE MODAL */}
          {selectedPatientProfile && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-3xl font-bold text-blue-800">
                    Patient Profile: {selectedPatientProfile.name}
                  </h2>
                  <button
                    onClick={() => setSelectedPatientProfile(null)}
                    className="text-gray-500 hover:text-red-500 font-bold text-xl"
                  >
                    ×
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-8 bg-blue-50 p-4 rounded-xl">
                  <div><span className="font-bold">ID:</span> {selectedPatientProfile.id}</div>
                  <div><span className="font-bold">Age/Gender:</span> {selectedPatientProfile.age} / {selectedPatientProfile.gender}</div>
                  <div><span className="font-bold">Phone:</span> {selectedPatientProfile.phone}</div>
                  <div><span className="font-bold">Email:</span> {selectedPatientProfile.email}</div>
                  <div><span className="font-bold">Doctor:</span> {selectedPatientProfile.doctor}</div>
                  <div><span className="font-bold">Date:</span> {new Date(selectedPatientProfile.date).toLocaleDateString()}</div>
                </div>

                <div className="flex flex-col gap-6">
                  <div>
                    <h3 className="text-xl font-bold text-blue-700 mb-4">Assigned Tests</h3>
                    <div className="mb-4 flex gap-2">
                      <select
                        value={newTestType}
                        onChange={(e) => setNewTestType(e.target.value)}
                        className="flex-1 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Test to Add</option>
                        {Object.keys(LAB_TESTS_DATA).map((test) => (
                          <option key={test} value={test}>{test}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleAddTest}
                        className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700"
                      >
                        Add
                      </button>
                    </div>

                    <div className="overflow-x-auto bg-gray-50 rounded-xl border">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-gray-100 text-gray-700 border-b">
                            <th className="p-3">Test</th>
                            <th className="p-3">Machine</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {testResults
                            .filter((r) => r.patient_id === selectedPatientProfile.id)
                            .map((test) => (
                            <React.Fragment key={test.id}>
                              <tr className="border-b bg-white hover:bg-gray-50">
                                <td className="p-3 font-semibold">{test.test_name}</td>
                                <td className="p-3 text-sm">{test.machine_name}</td>
                                <td className="p-3">
                                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                                    test.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                  }`}>
                                    {test.status}
                                  </span>
                                </td>
                                <td className="p-3 flex justify-center gap-2">
                                  <button
                                    className="px-4 py-2 bg-blue-600 text-white rounded font-bold text-xs hover:bg-blue-700 shadow"
                                    onClick={() => setActiveTestConnection(activeTestConnection === test.id ? null : test.id)}
                                  >
                                    Analyzer Connection
                                  </button>
                                </td>
                              </tr>
                              {activeTestConnection === test.id && (
                                <tr className="bg-blue-50/50">
                                  <td colSpan="4" className="p-4 border-b">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div className="bg-white border rounded-xl p-4 shadow-sm">
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="font-bold text-blue-700">Connection Settings</h4>
                                            <div className={`px-2 py-1 rounded text-xs font-bold ${connectionStatus === "Connected" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
                                                {connectionStatus}
                                            </div>
                                        </div>
                                        <div className="flex gap-2 mb-4 bg-gray-100 p-1 rounded-lg">
                                          <button 
                                            className={`flex-1 py-1 text-sm font-bold rounded-md ${connectionMode === 'serial' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:bg-gray-200'}`}
                                            onClick={() => setConnectionMode('serial')}
                                          >
                                            Serial (COM)
                                          </button>
                                          <button 
                                            className={`flex-1 py-1 text-sm font-bold rounded-md ${connectionMode === 'network' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:bg-gray-200'}`}
                                            onClick={() => setConnectionMode('network')}
                                          >
                                            Network (TCP)
                                          </button>
                                        </div>

                                        <div className="space-y-3">
                                          {connectionMode === "serial" ? (
                                            <div className="grid grid-cols-2 gap-3">
                                              <div>
                                                <label className="text-xs font-bold text-gray-500 uppercase">COM Port</label>
                                                <select
                                                  className="w-full mt-1 p-2 border rounded focus:ring-2 focus:ring-blue-500"
                                                  value={selectedPort}
                                                  onChange={(e) => setSelectedPort(e.target.value)}
                                                >
                                                  <option value="">-- Choose Port --</option>
                                                  {ports.map((port, index) => (
                                                    <option key={`mport-${index}`} value={port.path}>
                                                      {port.path}
                                                    </option>
                                                  ))}
                                                </select>
                                              </div>
                                              <div>
                                                <label className="text-xs font-bold text-gray-500 uppercase">Baud Rate</label>
                                                <input
                                                  type="number"
                                                  className="w-full mt-1 p-2 border rounded focus:ring-2 focus:ring-blue-500"
                                                  value={baudRate}
                                                  onChange={(e) => setBaudRate(Number(e.target.value) || 9600)}
                                                />
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="grid grid-cols-2 gap-3">
                                              <div>
                                                <label className="text-xs font-bold text-gray-500 uppercase">IP Address</label>
                                                <input
                                                  type="text"
                                                  placeholder="192.168.1.100"
                                                  className="w-full mt-1 p-2 border rounded focus:ring-2 focus:ring-blue-500"
                                                  value={networkHost}
                                                  onChange={(e) => setNetworkHost(e.target.value)}
                                                />
                                              </div>
                                              <div>
                                                <label className="text-xs font-bold text-gray-500 uppercase">Port</label>
                                                <input
                                                  type="number"
                                                  placeholder="8080"
                                                  className="w-full mt-1 p-2 border rounded focus:ring-2 focus:ring-blue-500"
                                                  value={networkPort}
                                                  onChange={(e) => setNetworkPort(e.target.value)}
                                                />
                                              </div>
                                            </div>
                                          )}
                                          <div className="flex gap-2 pt-2">
                                            {connectionMode === 'serial' && <button type="button" onClick={fetchAnalyzerPorts} className="flex-1 bg-gray-200 py-2 rounded font-bold text-xs hover:bg-gray-300">Scan</button>}
                                            <button type="button" onClick={connectAnalyzer} className="flex-1 bg-blue-600 text-white py-2 rounded font-bold text-xs hover:bg-blue-700">Connect</button>
                                            <button type="button" onClick={disconnectAnalyzer} className="flex-1 bg-red-600 text-white py-2 rounded font-bold text-xs hover:bg-red-700">Disconnect</button>
                                          </div>
                                        </div>
                                      </div>

                                      <div className="bg-black/90 rounded-xl p-4 text-green-500 font-mono text-sm overflow-hidden flex flex-col min-h-[200px]">
                                        <h4 className="text-white font-bold mb-3 flex items-center gap-2">
                                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                            INCOMING RESULT
                                        </h4>
                                        <div className="flex-1 overflow-y-auto space-y-2">
                                            {connectionLogs.length === 0 ? <p className="opacity-50">Waiting for machine output...</p> : 
                                             connectionLogs.map((log, i) => {
                                               if (log.type === 'result') {
                                                 return (
                                                   <div key={i} className="mb-2 p-3 border border-green-500/30 rounded flex flex-col items-center bg-green-900/20 gap-3">
                                                     <div className="text-center">
                                                       <span className="text-gray-400 text-xs">Test Value Received</span>
                                                       <div className="text-white font-bold text-3xl mt-1">
                                                         {log.payload.result_value} <span className="text-lg text-gray-300">{log.payload.unit}</span>
                                                       </div>
                                                     </div>
                                                     <button 
                                                       className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold text-sm hover:bg-blue-700 w-full shadow-lg hover:scale-105 transition"
                                                       onClick={async () => {
                                                         try {
                                                           const res = await generateReport({
                                                             patientId: log.payload.patient_id || selectedPatientProfile.id,
                                                             reportType: log.payload.test_name || 'Machine Test',
                                                             findings: `Result: ${log.payload.result_value} ${log.payload.unit}\nReference: ${log.payload.reference_range}`,
                                                             doctorNotes: 'Generated from live machine stream.'
                                                           });
                                                           alert(`Report generated: ${res.id}`);
                                                           navigate('/report');
                                                         } catch (err) {
                                                           alert('Failed to generate report: ' + err.message);
                                                         }
                                                       }}
                                                     >
                                                       Generate Report
                                                     </button>
                                                   </div>
                                                 );
                                               }
                                               return null; // hide raw logs, just show results to keep it clean
                                             })
                                            }
                                            {connectionLogs.some(log => log.type === 'result') === false && connectionLogs.length > 0 && (
                                                <p className="opacity-50 animate-pulse text-center mt-8">Listening to machine data...</p>
                                            )}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TEST RESULTS SECTION */}
          <div className="lg:col-span-3 bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl p-6 mt-6">
            <h2 className="text-2xl font-bold mb-4 text-blue-700">Test Results</h2>
            {testResults.length === 0 ? (
              <p className="text-gray-500 text-center p-6">No results yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-lg">
                  <thead>
                    <tr className="bg-blue-600 text-white text-left">
                      <th className="p-4">ID</th>
                      <th className="p-4">Patient Name</th>
                      <th className="p-4">Test</th>
                      <th className="p-4">Machine</th>
                      <th className="p-4">Result</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Date</th>
                      <th className="p-4">Action</th> 
                    </tr>
                  </thead>
                  <tbody>
                    {testResults.map((r) => (
                      <tr key={r.id} className="border-b hover:bg-blue-50 transition">
                        <td className="p-4 font-semibold">{r.id}</td>
                        <td className="p-4">{r.patient_name}</td>
                        <td className="p-4">{r.test_name}</td>
                        <td className="p-4">{r.machine_name}</td>
                        <td className="p-4">{r.result_value}</td>
                        <td className="p-4">
                          <span
                            className={`px-3 py-1 rounded-full font-semibold ${
                              r.status === "Completed"
                                ? "bg-green-100 text-green-700"
                                : "bg-yellow-100 text-yellow-700"
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="p-4">{r.date}</td>
                        <td className="p-4">
                          <button
                            className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:scale-105 transition"
                            onClick={() => setSelectedReport(r)}
                          >
                            View Report
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

                {/* REPORT SECTION */}
                {selectedReport && (
                <div className="lg:col-span-3 bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl p-6 mt-6">
              <h2 className="text-2xl font-bold mb-4 text-blue-700">Test Report</h2>
              <div className="space-y-2">
                <p><strong>Report ID:</strong> {selectedReport.id}</p>
                <p><strong>Patient Name:</strong> {selectedReport.patient_name}</p>
                <p><strong>Test Type:</strong> {selectedReport.test_name}</p>
                <p><strong>Machine:</strong> {selectedReport.machine_name}</p>
                <p><strong>Result:</strong> {selectedReport.result_value}</p>
                <p><strong>Status:</strong> {selectedReport.status}</p>
                <p><strong>Date:</strong> {new Date(selectedReport.date).toLocaleString()}</p>
              </div>
              <div className="mt-6 flex gap-4">
                <button
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:scale-105 transition"
                  onClick={openReport}
                >
                  Generate Report
                </button>

                <button
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:scale-105 transition"
                  onClick={() => setSelectedReport(null)}
                >
                  Close Report
                </button>
</div>
            </div>
              )}

        </div>
      </div>
    </div>
  );
};

export default Patient;