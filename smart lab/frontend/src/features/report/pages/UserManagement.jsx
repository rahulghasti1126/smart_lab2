import { useEffect, useState } from "react";
import Navbar from "../../components/Navbar";
import { getUsers, updateUserRole } from "../services/api";

const roles = ["technician", "pathologist", "admin"];

const UserManagement = () => {
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const [users, setUsers] = useState([]);
  const [selectedRoles, setSelectedRoles] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    getUsers()
      .then((rows) => {
        setUsers(rows);
        setSelectedRoles(Object.fromEntries(rows.map((user) => [user.id, user.role])));
      })
      .catch((err) => setError(err.message || "Unable to load users."))
      .finally(() => setLoading(false));
  }, []);

  const handleRoleChange = (userId, role) => {
    setSelectedRoles((current) => ({ ...current, [userId]: role }));
    setMessage("");
    setError("");
  };

  const handleSave = async (user) => {
    const role = selectedRoles[user.id];
    if (!roles.includes(role) || role === user.role) return;
    if (role === "admin" && !window.confirm(`Grant administrator access to ${user.username}?`)) return;

    setSavingUserId(user.id);
    setError("");
    setMessage("");
    try {
      const updatedUser = await updateUserRole(user.id, role);
      setUsers((current) => current.map((item) => item.id === user.id ? updatedUser : item));
      setSelectedRoles((current) => ({ ...current, [user.id]: updatedUser.role }));
      setMessage(`Updated ${updatedUser.username} to ${updatedUser.role}.`);
    } catch (err) {
      setError(err.message || "Unable to update user role.");
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <div className="min-h-screen bg-cover bg-center" style={{ backgroundImage: "url('/background.png')" }}>
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <section className="rounded-2xl border border-white/40 bg-white/95 p-6 shadow-xl">
          <h1 className="mb-2 text-3xl font-bold text-blue-800">User Roles</h1>
          <p className="mb-6 text-gray-600">
            Assign pathologist access only to qualified staff. Report verification remains limited to administrators and pathologists.
          </p>

          {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
          {message && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-green-700">{message}</p>}

          {loading ? (
            <p className="py-8 text-center text-gray-500">Loading users...</p>
          ) : users.length === 0 ? (
            <p className="py-8 text-center text-gray-500">No users found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b bg-blue-50 text-sm uppercase text-gray-600">
                    <th className="p-3">Name</th>
                    <th className="p-3">Username</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const selectedRole = selectedRoles[user.id] || user.role;
                    const isCurrentUser = user.id === currentUser.id;
                    return (
                      <tr key={user.id} className="border-b last:border-0">
                        <td className="p-3 font-medium">{user.name || "—"}</td>
                        <td className="p-3">{user.username}</td>
                        <td className="p-3">
                          <select
                            aria-label={`Role for ${user.username}`}
                            className="rounded-lg border border-gray-300 p-2"
                            value={selectedRole}
                            disabled={isCurrentUser || savingUserId === user.id}
                            onChange={(event) => handleRoleChange(user.id, event.target.value)}
                          >
                            {roles.map((role) => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                          {isCurrentUser && <p className="mt-1 text-xs text-gray-500">Your own role cannot be changed here.</p>}
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isCurrentUser || selectedRole === user.role || savingUserId === user.id}
                            onClick={() => handleSave(user)}
                          >
                            {savingUserId === user.id ? "Saving..." : "Save"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default UserManagement;
