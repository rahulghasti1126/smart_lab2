import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { getPorts, connectMachine as connectMachineAPI, disconnectMachine, getPortStatus, startMachine, stopMachine, generateReport } from "../services/api";
import socket from '../../../app/socket';

export default function Analyzer() {
  const navigate = useNavigate();
  const [ports, setPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [baudRate, setBaudRate] = useState(9600);
  const [status, setStatus] = useState("Disconnected");
  const [logs, setLogs] = useState([]);
  const [customCommand, setCustomCommand] = useState("START\\r\\n");

  useEffect(() => {
    fetchPorts();
    // check current port status
    (async () => {
      try {
        const s = await getPortStatus();
        if (s?.status) setStatus(s.status);
      } catch (e) {
        // ignore
      }
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

    socket.on('machine-connected', onMachineConnected);
    socket.on('machine-waiting', onMachineWaiting);
    socket.on('machine-error', onMachineError);
    socket.on('result-created', onResult);
    socket.on('raw-analyzer-data', (payload) => {
      const rawText = payload?.raw || payload?.data || 'No data';
      setLogs((prev) => [{ type: 'raw', text: `Raw stream: ${rawText}`, time: new Date() }, ...prev].slice(0, 200));
    });

    return () => {
      socket.off('machine-connected', onMachineConnected);
      socket.off('machine-waiting', onMachineWaiting);
      socket.off('machine-error', onMachineError);
      socket.off('result-created', onResult);
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

  const connectMachine = async () => {
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
  };

  const handleDisconnect = async () => {
    try {
      const res = await disconnectMachine();
      setStatus('Disconnected');
      setLogs(prev => [{ type: 'info', text: `Disconnected: ${res?.message || 'manual'}`, time: new Date() }, ...prev].slice(0, 200));
    } catch (e) {
      alert('Disconnect failed: ' + e.message);
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

  return (
    <div className="min-h-screen bg-cover bg-center" style={{ backgroundImage: "url('/background.png')" }}>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-blue-900/80 backdrop-blur-xl rounded-2xl p-8 shadow-2xl mb-8 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Real Hardware Connection</h1>
            <p className="text-blue-200">Connect your laboratory analyzer via RS-232/USB</p>
          </div>
          <div className={`px-4 py-2 rounded-lg font-bold ${status === 'Connected' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
            {status}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Connection Panel */}
          <div className="bg-white/95 backdrop-blur-lg rounded-3xl p-8 shadow-2xl border border-white/40">
            <h3 className="text-xl font-bold mb-6">Device Configuration</h3>
            <div className="space-y-6">
              <div className="space-y-6">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Select COM Port</label>
                  <select 
                    className="w-full mt-2 p-4 rounded-xl border border-gray-200"
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
                  <label className="text-xs font-bold text-gray-400 uppercase">Baud Rate</label>
                  <input
                    type="number"
                    className="w-full mt-2 p-4 rounded-xl border border-gray-200"
                    value={baudRate}
                    onChange={(e) => setBaudRate(Number(e.target.value) || 9600)}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Custom Start Command</label>
                  <input
                    type="text"
                    className="w-full mt-2 p-4 rounded-xl border border-gray-200"
                    value={customCommand}
                    onChange={(e) => setCustomCommand(e.target.value)}
                    placeholder="e.g. START\r\n"
                  />
                  <p className="text-xs text-gray-400 mt-1">Depends on analyzer (e.g. \r\n, \x02ENQ\x03, START\r\n)</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                  <button onClick={fetchPorts} className="flex-1 bg-gray-100 py-4 rounded-xl font-bold hover:bg-gray-200">Scan Ports</button>
                  <button onClick={connectMachine} className="flex-1 bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 shadow-lg">Connect Machine</button>
                  <button onClick={handleDisconnect} className="flex-1 bg-red-600 text-white py-4 rounded-xl font-bold hover:bg-red-700 shadow-lg">Disconnect</button>
              </div>
              <div className="flex gap-4 mt-4">
                  <button onClick={() => handleMachineAction('start')} className="flex-1 bg-green-600 text-white py-4 rounded-xl font-bold hover:bg-green-700 shadow-lg">Start</button>
                  <button onClick={() => handleMachineAction('stop')} className="flex-1 bg-yellow-600 text-white py-4 rounded-xl font-bold hover:bg-yellow-700 shadow-lg">Stop</button>
              </div>
            </div>
          </div>

          {/* Live Data Logs */}
          <div className="bg-black/90 rounded-3xl p-8 shadow-2xl text-green-500 font-mono text-sm overflow-hidden flex flex-col h-[400px]">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                LIVE HARDWARE STREAM
            </h3>
            <div className="flex-1 overflow-y-auto space-y-2">
                {logs.length === 0 ? <p className="opacity-50">Waiting for connection...</p> : 
                 logs.map((log, i) => {
                   if (typeof log === 'string') {
                     return <p key={i}><span className="text-gray-500">[{new Date().toLocaleTimeString()}]</span> {log}</p>;
                   }
                   if (log.type === 'result') {
                     return (
                       <div key={i} className="mb-2 p-3 border border-green-500/30 rounded flex flex-col md:flex-row justify-between items-start md:items-center bg-green-900/20 gap-3">
                         <div>
                           <span className="text-gray-500 text-xs">[{log.time.toLocaleTimeString()}]</span>
                           <div className="text-white font-semibold mt-1">
                             Result: {log.payload.test_name} = {log.payload.result_value} {log.payload.unit}
                           </div>
                           <div className="text-gray-400 text-xs mt-1">
                             Patient ID: {log.payload.patient_id} | Ref: {log.payload.reference_range}
                           </div>
                         </div>
                         <button 
                           className="bg-blue-600 text-white px-4 py-2 rounded font-bold text-xs hover:bg-blue-700 whitespace-nowrap shadow-lg transition-colors"
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
                   return <p key={i}><span className="text-gray-500">[{log.time.toLocaleTimeString()}]</span> {log.text}</p>;
                 })
                }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
