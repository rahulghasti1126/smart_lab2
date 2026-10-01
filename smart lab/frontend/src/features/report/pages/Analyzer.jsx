import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { getPorts, connectMachine as connectMachineAPI, disconnectMachine, getPortStatus, startMachine, stopMachine, generateReport, getAnalyzers, createAnalyzer, updateAnalyzer, testAnalyzerConnection, connectAnalyzer, disconnectAnalyzer } from "../services/api";
import socket from '../../../app/socket';

export default function Analyzer() {
  const navigate = useNavigate();
  const [connectionType, setConnectionType] = useState("NETWORK");
  
  // Serial State
  const [ports, setPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [baudRate, setBaudRate] = useState(9600);
  const [customCommand, setCustomCommand] = useState("START\\r\\n");
  
  // Network State
  const [analyzers, setAnalyzers] = useState([]);
  const [selectedAnalyzerId, setSelectedAnalyzerId] = useState("");
  const [networkForm, setNetworkForm] = useState({
    name: "", model: "", ipAddress: "", serverIp: "", port: "", tcpMode: "CLIENT", protocol: "HL7", autoConnect: false, autoReceive: true, enabled: true
  });

  // Common State
  const [status, setStatus] = useState("Disconnected");
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    fetchPorts();
    fetchAnalyzers();
    
    // check current port status
    (async () => {
      try {
        const s = await getPortStatus();
        if (s?.status) setStatus(s.status);
      } catch (e) {}
    })();
    
    const onMachineConnected = (p) => {
      setStatus('Connected');
      setLogs((prev) => [{ type: 'info', text: `Machine connected: ${p.path || JSON.stringify(p)}`, time: new Date() }, ...prev].slice(0, 200));
    };

    const onMachineWaiting = (p) => {
      setStatus('Waiting');
      setLogs((prev) => [{ type: 'info', text: `Port open; waiting for analyzer data: ${p.path || 'COM port'}`, time: new Date() }, ...prev].slice(0, 200));
    };

    const onMachineError = (err) => {
      setStatus('Error');
      setLogs((prev) => [{ type: 'error', text: `Machine error: ${err?.error || JSON.stringify(err)}`, time: new Date() }, ...prev].slice(0, 200));
    };

    const onResult = (payload) => {
      setLogs((prev) => [{ type: 'result', payload, time: new Date() }, ...prev].slice(0, 200));
    };

    const onIntegrationStatus = (payload) => {
      if (payload.status) setStatus(payload.status);
    };

    socket.on('machine-connected', onMachineConnected);
    socket.on('machine-waiting', onMachineWaiting);
    socket.on('machine-error', onMachineError);
    socket.on('result-created', onResult);
    socket.on('machine-integration-status', onIntegrationStatus);
    socket.on('raw-analyzer-data', (payload) => {
      const rawText = payload?.raw || payload?.data || 'No data';
      setLogs((prev) => [{ type: 'raw', text: `Raw stream: ${rawText}`, time: new Date() }, ...prev].slice(0, 200));
    });

    return () => {
      socket.off('machine-connected', onMachineConnected);
      socket.off('machine-waiting', onMachineWaiting);
      socket.off('machine-error', onMachineError);
      socket.off('result-created', onResult);
      socket.off('machine-integration-status', onIntegrationStatus);
      socket.off('raw-analyzer-data');
    };
  }, []);

  const fetchPorts = async () => {
    try {
      const data = await getPorts();
      setPorts(data);
    } catch (err) {
      console.error("Error fetching ports:", err);
    }
  };

  const fetchAnalyzers = async () => {
    try {
      const data = await getAnalyzers();
      setAnalyzers(data);
    } catch (err) {
      console.error("Error fetching analyzers:", err);
    }
  };

  const handleAnalyzerSelect = (e) => {
    const id = e.target.value;
    setSelectedAnalyzerId(id);
    if (id === "new") {
      setNetworkForm({ name: "", model: "", ipAddress: "", serverIp: "", port: "", tcpMode: "CLIENT", protocol: "HL7", autoConnect: false, autoReceive: true, enabled: true });
      setStatus("Disconnected");
    } else if (id) {
      const analyzer = analyzers.find(a => a._id === id);
      if (analyzer) {
        setNetworkForm({
          name: analyzer.name, model: analyzer.model, ipAddress: analyzer.ip_address, serverIp: analyzer.server_ip, port: analyzer.port, tcpMode: analyzer.tcp_mode, protocol: analyzer.protocol, autoConnect: analyzer.auto_connect, autoReceive: analyzer.auto_receive, enabled: analyzer.enabled
        });
        setStatus(analyzer.connection_status || "Disconnected");
      }
    }
  };

  const handleNetworkFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setNetworkForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const saveNetworkConfig = async () => {
    try {
      if (!networkForm.name || !networkForm.ipAddress || !networkForm.port) {
        return alert("Name, IP Address, and Port are required.");
      }
      const payload = { ...networkForm };
      let res;
      if (selectedAnalyzerId && selectedAnalyzerId !== "new") {
        res = await updateAnalyzer(selectedAnalyzerId, payload);
      } else {
        res = await createAnalyzer(payload);
        setSelectedAnalyzerId(res._id);
      }
      alert("Configuration saved successfully.");
      fetchAnalyzers();
    } catch (err) {
      alert("Failed to save: " + err.message);
    }
  };

  const connectMachine = async () => {
    if (connectionType === "SERIAL") {
      if (!selectedPort) return alert("Please select a port first");
      try {
        const res = await connectMachineAPI({ path: selectedPort, baudRate });
        if (res?.message) {
          setStatus(res.status || "Waiting");
          setLogs(prev => [{ type: 'info', text: `Port ${selectedPort} opened at ${baudRate} baud; waiting for analyzer data`, time: new Date() }, ...prev].slice(0, 200));
        }
      } catch (err) {
        alert("Connection failed: " + err.message);
      }
    } else {
      if (!selectedAnalyzerId || selectedAnalyzerId === "new") return alert("Please select and save an analyzer configuration first.");
      try {
        const res = await connectAnalyzer(selectedAnalyzerId);
        setStatus(res.status || "Connecting");
        setLogs(prev => [{ type: 'info', text: `Connecting to ${networkForm.name}...`, time: new Date() }, ...prev].slice(0, 200));
      } catch (err) {
        alert("Connection failed: " + err.message);
      }
    }
  };

  const handleDisconnect = async () => {
    try {
      let res;
      if (connectionType === "SERIAL") {
        res = await disconnectMachine();
      } else {
        if (!selectedAnalyzerId || selectedAnalyzerId === "new") return alert("Please select an analyzer first.");
        res = await disconnectAnalyzer(selectedAnalyzerId);
      }
      setStatus('Disconnected');
      setLogs(prev => [{ type: 'info', text: `Disconnected: ${res?.message || 'manual'}`, time: new Date() }, ...prev].slice(0, 200));
    } catch (e) {
      alert('Disconnect failed: ' + e.message);
    }
  };

  const testNetworkConnection = async () => {
    if (!selectedAnalyzerId || selectedAnalyzerId === "new") return alert("Please select and save an analyzer configuration first.");
    try {
      const res = await testAnalyzerConnection(selectedAnalyzerId);
      alert(`Status: ${res.status}\nMessage: ${res.message}`);
    } catch (err) {
      alert("Test connection failed: " + err.message);
    }
  };

  const handleMachineAction = async (action) => {
    try {
      const parsedCommand = action === 'start' 
        ? customCommand.replace(/\\r/g, '\r').replace(/\\n/g, '\n').replace(/\\x02/g, '\x02').replace(/\\x03/g, '\x03') 
        : 'STOP\r\n';
        
      const res = action === 'start'
        ? await startMachine({ machine: 'Analyzer', patientName: 'Manual Start', command: parsedCommand })
        : await stopMachine({ machine: 'Analyzer', patientName: 'Manual Stop', command: 'STOP\r\n' });
      setLogs(prev => [{ type: 'info', text: `${action === 'start' ? 'Start' : 'Stop'} command: ${res?.message || 'sent'}`, time: new Date() }, ...prev].slice(0, 200));
    } catch (e) {
      alert(`${action === 'start' ? 'Start' : 'Stop'} failed: ${e.message}`);
    }
  };

  const getStatusColor = (currentStatus) => {
    if (!currentStatus) return 'bg-gray-500';
    const s = currentStatus.toUpperCase();
    if (s.includes('CONNECTED')) return 'bg-green-500';
    if (s.includes('CONNECTING') || s.includes('WAITING') || s.includes('STARTING')) return 'bg-yellow-500';
    if (s.includes('ERROR')) return 'bg-red-600';
    return 'bg-red-500';
  };

  return (
    <div className="min-h-screen bg-cover bg-center" style={{ backgroundImage: "url('/background.png')" }}>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-blue-900/80 backdrop-blur-xl rounded-2xl p-8 shadow-2xl mb-8 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Real Hardware Connection</h1>
            <p className="text-blue-200">Connect your laboratory analyzer via Network or COM port</p>
          </div>
          <div className={`px-6 py-3 rounded-xl font-bold text-white shadow-lg ${getStatusColor(status)}`}>
            {status}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Connection Panel */}
          <div className="bg-white/95 backdrop-blur-lg rounded-3xl p-8 shadow-2xl border border-white/40">
            <h3 className="text-xl font-bold mb-6 text-gray-800">Connection Settings</h3>
            
            <div className="mb-6 flex gap-4 bg-gray-100 p-2 rounded-xl">
              <button 
                onClick={() => setConnectionType("NETWORK")}
                className={`flex-1 py-3 rounded-lg font-bold transition-colors ${connectionType === "NETWORK" ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
              >
                Network (TCP)
              </button>
              <button 
                onClick={() => setConnectionType("SERIAL")}
                className={`flex-1 py-3 rounded-lg font-bold transition-colors ${connectionType === "SERIAL" ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
              >
                Serial (COM)
              </button>
            </div>

            {connectionType === "SERIAL" ? (
              <div className="space-y-6">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Select COM Port</label>
                  <select 
                    className="w-full mt-2 p-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                    value={selectedPort}
                    onChange={(e) => setSelectedPort(e.target.value)}
                  >
                    <option value="">-- Choose Port --</option>
                    {ports.map((p, i) => (
                      <option key={i} value={p.path}>{p.path} ({p.friendlyName || 'Analyzer'})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Baud Rate</label>
                  <input
                    type="number"
                    className="w-full mt-2 p-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                    value={baudRate}
                    onChange={(e) => setBaudRate(Number(e.target.value) || 9600)}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Custom Start Command</label>
                  <input
                    type="text"
                    className="w-full mt-2 p-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                    value={customCommand}
                    onChange={(e) => setCustomCommand(e.target.value)}
                    placeholder="e.g. START\r\n"
                  />
                  <p className="text-xs text-gray-400 mt-1">Depends on analyzer (e.g. \r\n, \x02ENQ\x03, START\r\n)</p>
                </div>
                <div className="flex gap-4 pt-4 border-t border-gray-100">
                  <button onClick={fetchPorts} className="flex-1 bg-gray-200 text-gray-800 py-4 rounded-xl font-bold hover:bg-gray-300 transition-colors">Scan Ports</button>
                  <button onClick={connectMachine} className="flex-1 bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 shadow-lg transition-colors">Connect</button>
                  <button onClick={handleDisconnect} className="flex-1 bg-red-600 text-white py-4 rounded-xl font-bold hover:bg-red-700 shadow-lg transition-colors">Disconnect</button>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => handleMachineAction('start')} className="flex-1 bg-green-600 text-white py-4 rounded-xl font-bold hover:bg-green-700 shadow-lg transition-colors">Start</button>
                  <button onClick={() => handleMachineAction('stop')} className="flex-1 bg-yellow-600 text-white py-4 rounded-xl font-bold hover:bg-yellow-700 shadow-lg transition-colors">Stop</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Saved Configuration</label>
                  <select 
                    className="w-full mt-2 p-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                    value={selectedAnalyzerId}
                    onChange={handleAnalyzerSelect}
                  >
                    <option value="">-- Select Configuration --</option>
                    <option value="new">+ Add New Configuration</option>
                    {analyzers.map((a) => (
                      <option key={a._id} value={a._id}>{a.name} ({a.ip_address}:{a.port})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Analyzer Name</label>
                    <input type="text" name="name" className="w-full mt-1 p-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none" value={networkForm.name} onChange={handleNetworkFormChange} placeholder="e.g. iCount 3TS" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Analyzer Model</label>
                    <input type="text" name="model" className="w-full mt-1 p-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none" value={networkForm.model} onChange={handleNetworkFormChange} placeholder="Model" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Analyzer IP Address</label>
                    <input type="text" name="ipAddress" className="w-full mt-1 p-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none" value={networkForm.ipAddress} onChange={handleNetworkFormChange} placeholder="192.168.1.103" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">LIS / Server IP Address</label>
                    <input type="text" name="serverIp" className="w-full mt-1 p-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none" value={networkForm.serverIp} onChange={handleNetworkFormChange} placeholder="192.168.1.102" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">TCP Port</label>
                    <input type="number" name="port" className="w-full mt-1 p-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none" value={networkForm.port} onChange={handleNetworkFormChange} placeholder="11000" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">TCP Mode</label>
                    <select name="tcpMode" className="w-full mt-1 p-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none" value={networkForm.tcpMode} onChange={handleNetworkFormChange}>
                      <option value="CLIENT">CLIENT</option>
                      <option value="SERVER">SERVER</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Protocol</label>
                    <input type="text" name="protocol" className="w-full mt-1 p-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none" value={networkForm.protocol} onChange={handleNetworkFormChange} placeholder="e.g. HL7, ASTM, LIS2-A2" />
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="autoConnect" checked={networkForm.autoConnect} onChange={handleNetworkFormChange} className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                    <span className="text-sm font-semibold text-gray-700">Auto Connect</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="autoReceive" checked={networkForm.autoReceive} onChange={handleNetworkFormChange} className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                    <span className="text-sm font-semibold text-gray-700">Auto Receive</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="enabled" checked={networkForm.enabled} onChange={handleNetworkFormChange} className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                    <span className="text-sm font-semibold text-gray-700">Enabled</span>
                  </label>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100">
                  <button onClick={saveNetworkConfig} className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 shadow transition-colors">Save</button>
                  <button onClick={testNetworkConnection} className="flex-1 bg-blue-100 text-blue-800 py-3 rounded-xl font-bold hover:bg-blue-200 transition-colors">Test</button>
                  <button onClick={connectMachine} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg transition-colors">Connect</button>
                  <button onClick={handleDisconnect} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 shadow-lg transition-colors">Disconnect</button>
                </div>
              </div>
            )}
          </div>

          {/* Live Data Logs */}
          <div className="bg-gray-900 rounded-3xl p-6 shadow-2xl text-green-400 font-mono text-sm overflow-hidden flex flex-col h-[600px] border border-gray-700">
            <h3 className="text-white font-bold mb-4 flex items-center gap-3 border-b border-gray-700 pb-3">
                <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_#22c55e]"></span>
                LIVE HARDWARE STREAM
            </h3>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
                {logs.length === 0 ? <div className="h-full flex items-center justify-center text-gray-500 italic">Waiting for connection stream...</div> : 
                 logs.map((log, i) => {
                   if (typeof log === 'string') {
                     return <p key={i}><span className="text-gray-500">[{new Date().toLocaleTimeString()}]</span> {log}</p>;
                   }
                   if (log.type === 'result') {
                     return (
                       <div key={i} className="mb-2 p-4 border border-green-500/40 rounded-xl flex flex-col xl:flex-row justify-between items-start xl:items-center bg-green-900/20 gap-4 hover:bg-green-900/30 transition-colors">
                         <div>
                           <span className="text-gray-500 text-xs tracking-wider">[{log.time.toLocaleTimeString()}]</span>
                           <div className="text-white font-bold mt-1 text-base">
                             Result: <span className="text-green-400">{log.payload.test_name}</span> = <span className="text-blue-300">{log.payload.result_value} {log.payload.unit}</span>
                           </div>
                           <div className="text-gray-400 text-xs mt-1 font-sans">
                             Patient ID: <span className="text-gray-300">{log.payload.patient_id}</span> | Ref: {log.payload.reference_range}
                           </div>
                         </div>
                         <button 
                           className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-bold text-sm hover:bg-blue-700 shadow transition-colors w-full xl:w-auto text-center"
                           onClick={async () => {
                             try {
                               const res = await generateReport({
                                 patientId: log.payload.patient_id || 'UNKNOWN',
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
                   return <p key={i} className="leading-relaxed"><span className="text-gray-500 select-none">[{log.time.toLocaleTimeString()}]</span> {log.text}</p>;
                 })
                }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
