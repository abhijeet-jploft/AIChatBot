import { useEffect, useMemo, useState } from 'react';
import { ACCESS_LEVELS, PERMISSION_MODULES, normalizePermissionMatrix } from '../lib/permissions';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';

function emptyRoleForm() {
  return {
    id: null,
    name: '',
    description: '',
    permissions: normalizePermissionMatrix({}),
  };
}

function emptyStaffForm(roleId = '') {
  return {
    id: null,
    name: '',
    email: '',
    roleId: roleId || '',
    isActive: true,
  };
}

export default function StaffManagement() {
  const { saFetch, admin } = useSuperAuth();
  const { showToast } = useSuperToast();

  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);
  const [overview, setOverview] = useState(null);
  const [roles, setRoles] = useState([]);
  const [staffRows, setStaffRows] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [roleForm, setRoleForm] = useState(() => emptyRoleForm());
  const [staffForm, setStaffForm] = useState(() => emptyStaffForm());
  const [invitePreview, setInvitePreview] = useState(null);
  const [deletingRoleId, setDeletingRoleId] = useState(null);
  const [replacementRoleId, setReplacementRoleId] = useState('');

  const canEdit = admin?.type === 'super_admin' || ['edit', 'full'].includes(String(admin?.permissions?.user_management || 'none'));
  const canDelete = admin?.type === 'super_admin' || String(admin?.permissions?.user_management || 'none') === 'full';

  const load = async () => {
    setLoading(true);
    try {
      const [overviewRes, rolesRes, staffRes, auditRes] = await Promise.all([
        saFetch('/staff/overview'),
        saFetch('/staff/roles'),
        saFetch('/staff/users'),
        saFetch('/staff/audit-logs?limit=20'),
      ]);
      const [overviewData, rolesData, staffData, auditData] = await Promise.all([
        overviewRes.json(),
        rolesRes.json(),
        staffRes.json(),
        auditRes.json(),
      ]);
      if (!overviewRes.ok) throw new Error(overviewData.error || 'Failed to load staff overview');
      if (!rolesRes.ok) throw new Error(rolesData.error || 'Failed to load roles');
      if (!staffRes.ok) throw new Error(staffData.error || 'Failed to load staff');
      if (!auditRes.ok) throw new Error(auditData.error || 'Failed to load audit logs');

      const nextRoles = Array.isArray(rolesData.rows) ? rolesData.rows : [];
      setOverview(overviewData);
      setRoles(nextRoles);
      setStaffRows(Array.isArray(staffData.rows) ? staffData.rows : []);
      setAuditLogs(Array.isArray(auditData.rows) ? auditData.rows : []);

      setRoleForm((current) => current.id ? current : (nextRoles[0] ? {
        id: nextRoles[0].id,
        name: nextRoles[0].name,
        description: nextRoles[0].description || '',
        permissions: normalizePermissionMatrix(nextRoles[0].permissions),
      } : emptyRoleForm()));
      setStaffForm((current) => current.id ? current : emptyStaffForm(nextRoles[0]?.id || ''));
    } catch (err) {
      showToast(err.message || 'Failed to load staff management', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const roleOptions = useMemo(() => roles.map((role) => ({ id: role.id, label: role.name })), [roles]);

  const handleSelectRole = (role) => {
    setDeletingRoleId(null);
    setReplacementRoleId('');
    setRoleForm({
      id: role.id,
      name: role.name,
      description: role.description || '',
      permissions: normalizePermissionMatrix(role.permissions),
    });
  };

  const handleSelectStaff = (row) => {
    setStaffForm({
      id: row.id,
      name: row.full_name,
      email: row.email,
      roleId: row.role_id || '',
      isActive: Boolean(row.is_active),
    });
  };

  const saveRole = async (event) => {
    event.preventDefault();
    setSavingRole(true);
    try {
      const method = roleForm.id ? 'PATCH' : 'POST';
      const path = roleForm.id ? `/staff/roles/${roleForm.id}` : '/staff/roles';
      const res = await saFetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roleForm.name.trim(),
          description: roleForm.description.trim(),
          permissions: roleForm.permissions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save role');
      showToast(roleForm.id ? 'Role updated' : 'Role created', 'success');
      setRoleForm(emptyRoleForm());
      await load();
    } catch (err) {
      showToast(err.message || 'Failed to save role', 'error');
    } finally {
      setSavingRole(false);
    }
  };

  const removeRole = async () => {
    if (!roleForm.id) return;
    try {
      const res = await saFetch(`/staff/roles/${roleForm.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replacementRoleId: replacementRoleId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete role');
      showToast('Role deleted', 'success');
      setRoleForm(emptyRoleForm());
      setDeletingRoleId(null);
      setReplacementRoleId('');
      await load();
    } catch (err) {
      showToast(err.message || 'Failed to delete role', 'error');
    }
  };

  const saveStaff = async (event) => {
    event.preventDefault();
    setSavingStaff(true);
    try {
      const method = staffForm.id ? 'PATCH' : 'POST';
      const path = staffForm.id ? `/staff/users/${staffForm.id}` : '/staff/users';
      const body = {
        name: staffForm.name.trim(),
        email: staffForm.email.trim(),
        roleId: staffForm.roleId,
        isActive: staffForm.isActive,
      };
      const res = await saFetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save staff user');
      if (data.temporaryPassword) setInvitePreview(data);
      showToast(staffForm.id ? 'Staff user updated' : 'Staff user created', 'success');
      setStaffForm(emptyStaffForm(roleOptions[0]?.id || ''));
      await load();
    } catch (err) {
      showToast(err.message || 'Failed to save staff user', 'error');
    } finally {
      setSavingStaff(false);
    }
  };

  const resetPassword = async (staffId) => {
    try {
      const res = await saFetch(`/staff/users/${staffId}/reset-password`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');
      setInvitePreview(data);
      showToast('Temporary password generated', 'success');
      await load();
    } catch (err) {
      showToast(err.message || 'Failed to reset password', 'error');
    }
  };

  const deleteStaff = async (staffId) => {
    try {
      const res = await saFetch(`/staff/users/${staffId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete staff user');
      showToast('Staff user deleted', 'success');
      setStaffForm(emptyStaffForm(roleOptions[0]?.id || ''));
      await load();
    } catch (err) {
      showToast(err.message || 'Failed to delete staff user', 'error');
    }
  };

  if (loading) return <div className="sa-loading">Loading staff management…</div>;

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <div>
          <h2 className="sa-page-title">Staff Management</h2>
          <p className="sa-text-muted sa-mb">
            Create staff roles, assign module permissions, invite team members, and review recent access activity.
          </p>
        </div>
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={load}>Refresh</button>
      </div>

      {invitePreview?.temporaryPassword ? (
        <div className="sa-panel sa-panel-info">
          <h3 className="sa-panel-title">Temporary password generated</h3>
          <p className="sa-text-muted sa-mb">
            Email delivery: {invitePreview.invite?.sent ? 'sent' : `not sent (${invitePreview.invite?.reason || 'unconfigured'})`}.
          </p>
          <div className="sa-inline-note">
            <strong>Temporary password:</strong> <span>{invitePreview.temporaryPassword}</span>
          </div>
        </div>
      ) : null}

      <div className="sa-kpi-grid sa-kpi-grid-sm">
        <div className="sa-kpi-card"><div className="sa-kpi-label">Roles</div><div className="sa-kpi-value">{overview?.counts?.roles || 0}</div></div>
        <div className="sa-kpi-card"><div className="sa-kpi-label">Total Staff</div><div className="sa-kpi-value">{overview?.counts?.staff || 0}</div></div>
        <div className="sa-kpi-card"><div className="sa-kpi-label">Active Staff</div><div className="sa-kpi-value">{overview?.counts?.activeStaff || 0}</div></div>
        <div className="sa-kpi-card"><div className="sa-kpi-label">Password Changes Pending</div><div className="sa-kpi-value">{overview?.counts?.pendingPasswordChanges || 0}</div></div>
      </div>

      <div className="sa-dashboard-cols">
        <div className="sa-panel">
          <div className="sa-panel-header-row">
            <h3 className="sa-panel-title">Role Management</h3>
            <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setRoleForm(emptyRoleForm())}>New role</button>
          </div>

          <div className="sa-table-wrap" style={{ marginBottom: 16 }}>
            <table className="sa-table">
              <thead>
                <tr><th>Role</th><th>Staff</th><th>Sensitive</th></tr>
              </thead>
              <tbody>
                {roles.map((role) => {
                  const permissions = normalizePermissionMatrix(role.permissions);
                  const sensitive = PERMISSION_MODULES.some((moduleDef) => moduleDef.sensitive && permissions[moduleDef.key] !== 'none');
                  return (
                    <tr key={role.id} className={roleForm.id === role.id ? 'sa-selectable-row is-selected' : 'sa-selectable-row'} onClick={() => handleSelectRole(role)}>
                      <td>{role.name}</td>
                      <td>{role.staff_count}</td>
                      <td>{sensitive ? 'Granted' : 'Restricted'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <form onSubmit={saveRole}>
            <div className="sa-field"><label>Role name</label><input type="text" value={roleForm.name} onChange={(e) => setRoleForm((current) => ({ ...current, name: e.target.value }))} disabled={!canEdit} required /></div>
            <div className="sa-field"><label>Description</label><textarea rows={2} value={roleForm.description} onChange={(e) => setRoleForm((current) => ({ ...current, description: e.target.value }))} disabled={!canEdit} /></div>

            <div className="sa-field">
              <label>Permissions</label>
              <div className="sa-permission-grid">
                {PERMISSION_MODULES.map((moduleDef) => (
                  <div key={moduleDef.key} className="sa-permission-row">
                    <div>
                      <div className="sa-permission-title">{moduleDef.label}</div>
                      <div className="sa-permission-meta">{moduleDef.sensitive ? 'Sensitive' : 'Standard'} module</div>
                    </div>
                    <select
                      value={roleForm.permissions[moduleDef.key] || 'none'}
                      onChange={(e) => setRoleForm((current) => ({
                        ...current,
                        permissions: {
                          ...current.permissions,
                          [moduleDef.key]: e.target.value,
                        },
                      }))}
                      disabled={!canEdit}
                    >
                      {ACCESS_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {deletingRoleId === roleForm.id ? (
              <div className="sa-field">
                <label>Replacement role before delete</label>
                <select value={replacementRoleId} onChange={(e) => setReplacementRoleId(e.target.value)}>
                  <option value="">Delete only if no staff are assigned</option>
                  {roleOptions.filter((role) => role.id !== roleForm.id).map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
                </select>
              </div>
            ) : null}

            <div className="sa-field-actions">
              <button type="submit" className="sa-btn sa-btn-primary" disabled={!canEdit || savingRole}>{savingRole ? 'Saving…' : roleForm.id ? 'Save role' : 'Create role'}</button>
              {roleForm.id ? <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setRoleForm(emptyRoleForm())}>Reset</button> : null}
              {roleForm.id ? <button type="button" className="sa-btn sa-btn-danger" disabled={!canDelete} onClick={() => deletingRoleId === roleForm.id ? removeRole() : setDeletingRoleId(roleForm.id)}>{deletingRoleId === roleForm.id ? 'Confirm delete' : 'Delete role'}</button> : null}
            </div>
          </form>
        </div>

        <div className="sa-panel">
          <div className="sa-panel-header-row">
            <h3 className="sa-panel-title">Staff Directory</h3>
            <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setStaffForm(emptyStaffForm(roleOptions[0]?.id || ''))}>Add staff</button>
          </div>

          <div className="sa-table-wrap" style={{ marginBottom: 16 }}>
            <table className="sa-table">
              <thead>
                <tr><th>Name</th><th>Role</th><th>Status</th><th>Last login</th></tr>
              </thead>
              <tbody>
                {staffRows.map((row) => (
                  <tr key={row.id} className={staffForm.id === row.id ? 'sa-selectable-row is-selected' : 'sa-selectable-row'} onClick={() => handleSelectStaff(row)}>
                    <td>{row.full_name}<div className="sa-table-subtext">{row.email}</div></td>
                    <td>{row.role_name || 'Unassigned'}</td>
                    <td>{row.is_active ? 'Active' : 'Inactive'}{row.must_change_password ? ' · reset pending' : ''}</td>
                    <td>{row.last_login_at ? new Date(row.last_login_at).toLocaleString() : 'Never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form onSubmit={saveStaff}>
            <div className="sa-field"><label>Name</label><input type="text" value={staffForm.name} onChange={(e) => setStaffForm((current) => ({ ...current, name: e.target.value }))} disabled={!canEdit} required /></div>
            <div className="sa-field"><label>Email</label><input type="email" value={staffForm.email} onChange={(e) => setStaffForm((current) => ({ ...current, email: e.target.value }))} disabled={!canEdit} required /></div>
            <div className="sa-field"><label>Role</label><select value={staffForm.roleId} onChange={(e) => setStaffForm((current) => ({ ...current, roleId: e.target.value }))} disabled={!canEdit} required><option value="">Select role</option>{roleOptions.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></div>
            <div className="sa-field-check"><label><input type="checkbox" checked={staffForm.isActive} onChange={(e) => setStaffForm((current) => ({ ...current, isActive: e.target.checked }))} disabled={!canEdit} />Staff account active</label></div>

            <div className="sa-field-actions">
              <button type="submit" className="sa-btn sa-btn-primary" disabled={!canEdit || savingStaff}>{savingStaff ? 'Saving…' : staffForm.id ? 'Save staff user' : 'Create staff user'}</button>
              {staffForm.id ? <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setStaffForm(emptyStaffForm(roleOptions[0]?.id || ''))}>Reset</button> : null}
              {staffForm.id ? <button type="button" className="sa-btn sa-btn-ghost" disabled={!canEdit} onClick={() => resetPassword(staffForm.id)}>Reset password</button> : null}
              {staffForm.id ? <button type="button" className="sa-btn sa-btn-danger" disabled={!canDelete} onClick={() => deleteStaff(staffForm.id)}>Delete staff</button> : null}
            </div>
          </form>
        </div>
      </div>

      <div className="sa-panel">
        <div className="sa-panel-header-row">
          <h3 className="sa-panel-title">Audit Logs</h3>
          <div className="sa-text-muted">Last {auditLogs.length} events</div>
        </div>
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th></tr>
            </thead>
            <tbody>
              {auditLogs.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.created_at).toLocaleString()}</td>
                  <td>{row.actor_label}</td>
                  <td>{row.action}</td>
                  <td>{row.target_label || row.target_type || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}