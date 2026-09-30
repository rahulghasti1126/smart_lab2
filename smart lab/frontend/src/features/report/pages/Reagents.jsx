import React, { useEffect, useState } from "react";
import Navbar from "../../components/Navbar";
import { getReagents, updateReagent } from "../services/api";

const Reagents = () => {
  const [reagents, setReagents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadReagents = async () => {
      setLoading(true);
      try {
        const items = await getReagents();
        setReagents(items);
      } catch (err) {
        console.error("Unable to fetch reagents", err);
      } finally {
        setLoading(false);
      }
    };
    loadReagents();
  }, []);

  const orderMore = async (item) => {
    try {
      await updateReagent({ id: item.id, stock: item.stock + 20 });
      const updatedItems = await getReagents();
      setReagents(updatedItems);
    } catch (err) {
      console.error("Unable to update reagent", err);
    }
  };

  return (
    <div className="min-h-screen bg-cover bg-center" style={{ backgroundImage: "url('/background.png')" }}>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white/90 backdrop-blur-lg rounded-2xl p-8 shadow-xl mb-8 border border-white/40">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Reagent Management</h1>
          <p className="text-gray-600">Track inventory and consumption levels</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {reagents.map((item, i) => (
            <div key={i} className="bg-white/90 backdrop-blur-lg rounded-xl p-6 shadow-lg border border-white/40 relative overflow-hidden">
               {item.stock < 20 && (
                <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] px-3 py-1 font-bold uppercase tracking-wider">
                  Low Stock
                </div>
              )}
              <h3 className="font-bold text-gray-800 text-lg mb-1">{item.name}</h3>
              <p className="text-xs text-blue-600 font-semibold mb-4">{item.machine}</p>
              
              <div className="mb-4">
                <div className="flex justify-between items-end mb-1">
                  <span className="text-sm font-medium text-gray-700">Stock Level</span>
                  <span className={`text-xl font-bold ${item.stock < 20 ? 'text-red-600' : 'text-green-600'}`}>
                    {item.stock}{item.unit}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${item.stock < 20 ? 'bg-red-500' : item.stock < 50 ? 'bg-yellow-400' : 'bg-green-500'}`}
                    style={{ width: `${item.stock}%` }}
                  ></div>
                </div>
              </div>
              
              <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                <span className="text-xs text-gray-500 italic">Exp: {item.expiry}</span>
                <button
                  className="text-xs font-bold text-blue-600 hover:text-blue-800"
                  onClick={() => orderMore(item)}
                >
                  Order More
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl p-6 border border-white/40">
          <h2 className="text-xl font-bold mb-6 text-gray-800">Recent Consumption Log</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 italic text-gray-500">
                  <th className="pb-4">Reagent</th>
                  <th className="pb-4">Quantity Used</th>
                  <th className="pb-4">Analyzer</th>
                  <th className="pb-4">Technician</th>
                  <th className="pb-4">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                    { name: "Glucose Reagent", qty: "5ml", machine: "Biochemistry", user: "Sam", time: "10:45 AM" },
                    { name: "CBC Reagent Pack", qty: "1 unit", machine: "Hematology", user: "Sam", time: "09:30 AM" },
                    { name: "Lipid Panel", qty: "10ml", machine: "Biochemistry", user: "Sam", time: "Yesterday" },
                ].map((log, i) => (
                  <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                    <td className="py-4 font-semibold text-gray-700">{log.name}</td>
                    <td className="py-4 text-gray-600">{log.qty}</td>
                    <td className="py-4 text-gray-600">{log.machine}</td>
                    <td className="py-4 text-gray-600">{log.user}</td>
                    <td className="py-4 text-sm text-gray-400">{log.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reagents;
