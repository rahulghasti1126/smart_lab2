const API = "/api";

const getAuthHeaders = () => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const headers = { "Content-Type": "application/json" };
  if (user.token) {
    headers["Authorization"] = `Bearer ${user.token}`;
  }
  return headers;
};

const machineHeaders = () => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  return { ...getAuthHeaders(), "x-user-role": user.role || "", "x-user-id": user.id || "" };
};

const handleResponse = async (response) => {
  if (!response.ok) {
    const text = await response.text();
    let errorMessage = response.statusText || 'API Error';
    try {
      const error = JSON.parse(text || '{}');
      errorMessage = error.error || error.message || errorMessage;
    } catch {
      if (text) errorMessage = text;
    }
    throw new Error(errorMessage || `HTTP ${response.status}`);
  }
  return response.json();
};

const authenticatedFetch = (path, options = {}) => fetch(path, {
  ...options,
  headers: { ...getAuthHeaders(), ...(options.headers || {}) },
});

export const loginUser = async (data) => {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
};

export const registerUser = async (data) => {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
};

export const addPatient = async (data) => {
  const res = await fetch(`${API}/patients/add`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
};

export const getPatients = async () => {
  const res = await authenticatedFetch(`${API}/patients/all`);
  return handleResponse(res);
};

export const addPatientTest = async (patientId, data) => {
  const res = await fetch(`${API}/patients/${patientId}/tests`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
};

export const getDashboard = async () => {
  const res = await authenticatedFetch(`${API}/patients/dashboard`);
  return handleResponse(res);
};

export const getDashboardStats = async () => {
  const res = await authenticatedFetch(`${API}/dashboard-stats`);
  return handleResponse(res);
};

export const getRecentTests = async () => {
  const res = await authenticatedFetch(`${API}/recent-tests`);
  return handleResponse(res);
};

export const getResults = async () => {
  const res = await authenticatedFetch(`${API}/results`);
  return handleResponse(res);
};

export const addResult = async (data) => {
  const res = await fetch(`${API}/results/add`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
};

export const getReagents = async () => {
  const res = await authenticatedFetch(`${API}/reagents`);
  return handleResponse(res);
};

export const updateReagent = async (data) => {
  const res = await fetch(`${API}/reagents/update`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
};

export const getReports = async () => {
  const res = await authenticatedFetch(`${API}/reports`);
  return handleResponse(res);
};

export const verifyReport = async (id) => {
  const res = await fetch(`${API}/reports/verify`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ id }),
  });
  return handleResponse(res);
};

export const distributeReport = async (id) => {
  const res = await fetch(`${API}/reports/distribute`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ id }),
  });
  return handleResponse(res);
};

export const getHistory = async () => {
  const res = await authenticatedFetch(`${API}/history`);
  return handleResponse(res);
};

export const getDailyHistory = async (date) => {
  const res = await authenticatedFetch(`${API}/history/daily?date=${encodeURIComponent(date)}`);
  return handleResponse(res);
};

export const downloadReportPdf = async (id) => {
  const response = await authenticatedFetch(`${API}/reports/${encodeURIComponent(id)}/pdf`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Could not download the report PDF.');
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `${id}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
};

export const getBilling = async () => {
  const res = await authenticatedFetch(`${API}/billing`);
  return handleResponse(res);
};

export const getBillingSummary = async () => {
  const res = await authenticatedFetch(`${API}/billing/summary`);
  return handleResponse(res);
};

export const getPaymentQr = async () => {
  const res = await authenticatedFetch(`${API}/billing/payment-qr`);
  return handleResponse(res);
};

export const savePaymentQr = async (paymentQr) => {
  const res = await fetch(`${API}/billing/payment-qr`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ paymentQr }),
  });
  return handleResponse(res);
};

export const createInvoice = async (data) => {
  const res = await fetch(`${API}/billing/create`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
};

export const generateReport = async (data) => {
  const res = await fetch(`${API}/reports/generate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
};

export const updateReport = async (data) => {
  const res = await fetch(`${API}/reports/update`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
};

export const updateResult = async (data) => {
  const res = await fetch(`${API}/results/update`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
};

export const getPorts = async () => {
  const res = await authenticatedFetch(`${API}/ports`);
  return handleResponse(res);
};

export const connectMachine = async (data) => {
  const res = await fetch(`${API}/connect`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
};

export const connectMachineNetwork = async (data) => {
  const res = await fetch(`${API}/connect-network`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
};

export const disconnectMachine = async () => {
  const res = await fetch(`${API}/disconnect`, { method: 'POST' });
  return handleResponse(res);
};

export const startMachine = async (data = {}) => {
  const res = await fetch(`${API}/machine/start`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
};

export const stopMachine = async (data = {}) => {
  const res = await fetch(`${API}/machine/stop`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
};

export const getPortStatus = async () => {
  const res = await authenticatedFetch(`${API}/port/status`);
  return handleResponse(res);
};

export const getAnalyzers = async () => handleResponse(await authenticatedFetch(`${API}/machine-integration/analyzers`));

export const createAnalyzer = async (data) => handleResponse(await fetch(`${API}/machine-integration/analyzers`, {
  method: "POST", headers: machineHeaders(), body: JSON.stringify(data),
}));

export const updateAnalyzer = async (id, data) => handleResponse(await fetch(`${API}/machine-integration/analyzers/${id}`, {
  method: "PATCH", headers: machineHeaders(), body: JSON.stringify(data),
}));

export const testAnalyzerConnection = async (id) => handleResponse(await fetch(`${API}/machine-integration/analyzers/${id}/test-connection`, {
  method: "POST", headers: machineHeaders(),
}));

export const connectAnalyzer = async (id) => handleResponse(await fetch(`${API}/machine-integration/analyzers/${id}/connect`, {
  method: "POST", headers: machineHeaders(),
}));

export const disconnectAnalyzer = async (id) => handleResponse(await fetch(`${API}/machine-integration/analyzers/${id}/disconnect`, {
  method: "POST", headers: machineHeaders(),
}));

export const simulateAnalyzerMessage = async (id, data) => handleResponse(await fetch(`${API}/machine-integration/analyzers/${id}/simulate`, {
  method: "POST", headers: machineHeaders(), body: JSON.stringify(data),
}));

export const getMachineMessages = async () => handleResponse(await authenticatedFetch(`${API}/machine-integration/messages`));

export const getMachineResults = async () => handleResponse(await authenticatedFetch(`${API}/machine-integration/results`));

export const getUnmatchedMachineResults = async () => handleResponse(await authenticatedFetch(`${API}/machine-integration/unmatched-results`));

export const resolveUnmatchedMachineResult = async (id, data) => handleResponse(await authenticatedFetch(`${API}/machine-integration/unmatched-results/${id}/resolve`, {
  method: 'POST', body: JSON.stringify(data),
}));

export const getPatientMachineResults = async (patientId) => handleResponse(
  await authenticatedFetch(`${API}/patients/${encodeURIComponent(patientId)}/machine-results`)
);
