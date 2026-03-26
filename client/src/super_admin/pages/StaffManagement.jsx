import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACCESS_LEVELS, PERMISSION_MODULES, normalizePermissionMatrix } from '../lib/permissions';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';

const AUDIT_PAGE_SIZE = 20;
const AUDIT_DEBOUNCE_MS = 400;
const STAFF_PAGE_SIZE = 20;

const TABS = [
  { id: 'roles', label: 'Role Management' },
  { id: 'staff', label: 'Staff Directory' },
  { id: 'audit', label: 'Audit Logs' },
];

const AI_MODE_PERMISSION_KEYS = [
  'ai_configuration',
  'ai_mode_lead_generation',
  'ai_mode_meeting_booking',
  'ai_mode_product_recommendation',
  'ai_mode_customer_support',
  'ai_mode_mixed_mode',
];

const TRAINING_PERMISSION_KEYS = [
  'training_scrape',
  'training_conversational',
  'training_documents',
  'training_database',
  'training_media',
  'training_structured',
  'training_manual',
];

const DISPLAY_PERMISSION_MODULES = [
  { key: 'dashboard', label: 'Dashboard', sensitive: false, sourceKeys: ['dashboard'] },
  { key: 'business_management', label: 'Business Management', sensitive: false, sourceKeys: ['business_management'] },
  { key: 'user_management', label: 'User Management', sensitive: false, sourceKeys: ['user_management'] },
  { key: 'ai_mode', label: 'AI Mode', sensitive: false, sourceKeys: AI_MODE_PERMISSION_KEYS },
  { key: 'training', label: 'Training', sensitive: false, sourceKeys: TRAINING_PERMISSION_KEYS },
  { key: 'voice_management', label: 'Voice Management', sensitive: false, sourceKeys: ['voice_management'] },
  { key: 'api_management', label: 'API Management', sensitive: false, sourceKeys: ['api_management'] },
  { key: 'conversation_monitoring', label: 'Conversation Monitoring', sensitive: false, sourceKeys: ['conversation_monitoring'] },
  { key: 'analytics', label: 'Analytics', sensitive: false, sourceKeys: ['analytics'] },
  { key: 'billing_revenue', label: 'Billing & Revenue', sensitive: true, sourceKeys: ['billing_revenue'] },
  { key: 'subscription_management', label: 'Subscription Management', sensitive: true, sourceKeys: ['subscription_management'] },
  { key: 'support_tickets', label: 'Support Tickets', sensitive: false, sourceKeys: ['support_tickets'] },
  { key: 'system_settings', label: 'System Settings', sensitive: true, sourceKeys: ['system_settings'] },
];

function accessRank(level) {
  const index = ACCESS_LEVELS.indexOf(level);
  return index >= 0 ? index : 0;
}

function highestAccessLevel(levels = []) {
  return levels.reduce((current, level) => (accessRank(level) > accessRank(current) ? level : current), 'none');
}

function buildRolePermissionForm(input) {
  const normalized = normalizePermissionMatrix(input);
  return DISPLAY_PERMISSION_MODULES.reduce((acc, moduleDef) => {
    acc[moduleDef.key] = highestAccessLevel(moduleDef.sourceKeys.map((sourceKey) => normalized[sourceKey] || 'none'));
    return acc;
  }, {});
}

function expandRolePermissionForm(input) {
  const next = normalizePermissionMatrix({});
  DISPLAY_PERMISSION_MODULES.forEach((moduleDef) => {
    const value = String(input?.[moduleDef.key] || 'none').trim().toLowerCase();
    const normalizedValue = ACCESS_LEVELS.includes(value) ? value : 'none';
    moduleDef.sourceKeys.forEach((sourceKey) => {
      next[sourceKey] = normalizedValue;
    });
  });
  return next;
}

function emptyRoleForm() {
  return {
    id: null,
    name: '',
    description: '',
    permissions: buildRolePermissionForm({}),
  };
}

function parseStaffRowRoleIds(row) {
  if (Array.isArray(row?.role_ids)) return row.role_ids.map((id) => String(id));
  if (Array.isArray(row?.roleIds)) return row.roleIds.map((id) => String(id));
  if (row?.role_id) return [String(row.role_id)];
  return [];
}

function emptyStaffForm(initialRoleIds = []) {
  return {
    id: null,
    name: '',
    email: '',
    roleIds: [...initialRoleIds],
    isActive: true,
  };
}

export default function StaffManagement() {
  const { saFetch, admin } = useSuperAuth();
  const { showToast } = useSuperToast();

  const [activeTab, setActiveTab] = useState('roles');
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);
  const [overview, setOverview] = useState(null);
  const [roles, setRoles] = useState([]);
  const [staffRows, setStaffRows] = useState([]);
  const [staffPage, setStaffPage] = useState(1);
  const [staffTotal, setStaffTotal] = useState(0);
  const [staffTotalPages, setStaffTotalPages] = useState(1);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [staffQ, setStaffQ] = useState('');
  const [staffQDebounced, setStaffQDebounced] = useState('');
  const [staffStatus, setStaffStatus] = useState('all');
  const [staffRoleFilter, setStaffRoleFilter] = useState('');
  const [roleForm, setRoleForm] = useState(() => emptyRoleForm());
  const [staffForm, setStaffForm] = useState(() => emptyStaffForm());
  const [invitePreview, setInvitePreview] = useState(null);
  const [deletingRoleId, setDeletingRoleId] = useState(null);
  const [replacementRoleId, setReplacementRoleId] = useState('');

  const [auditRows, setAuditRows] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditQ, setAuditQ] = useState('');
  const [auditQDebounced, setAuditQDebounced] = useState('');
  const [auditActorType, setAuditActorType] = useState('');
  const [auditAction, setAuditAction] = useState('');
  const [auditTargetType, setAuditTargetType] = useState('');
  const [auditDateFrom, setAuditDateFrom] = useState('');
  const [auditDateTo, setAuditDateTo] = useState('');

  const searchDebounceRef = useRef(null);
  const staffSearchDebounceRef = useRef(null);
  const prevActiveTabRef = useRef('roles');

  const canEdit = admin?.type === 'super_admin' || ['edit', 'full'].includes(String(admin?.permissions?.user_management || 'none'));
  const canDelete = admin?.type === 'super_admin' || String(admin?.permissions?.user_management || 'none') === 'full';

  const loadCore = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, rolesRes] = await Promise.all([
        saFetch('/staff/overview'),
        saFetch('/staff/roles'),
      ]);
      const [overviewData, rolesData] = await Promise.all([
        overviewRes.json(),
        rolesRes.json(),
      ]);
      if (!overviewRes.ok) throw new Error(overviewData.error || 'Failed to load staff overview');
      if (!rolesRes.ok) throw new Error(rolesData.error || 'Failed to load roles');

      const nextRoles = Array.isArray(rolesData.rows) ? rolesData.rows : [];
      setOverview(overviewData);
      setRoles(nextRoles);

      setRoleForm((current) => current.id ? current : (nextRoles[0] ? {
        id: nextRoles[0].id,
        name: nextRoles[0].name,
        description: nextRoles[0].description || '',
        permissions: buildRolePermissionForm(nextRoles[0].permissions),
      } : emptyRoleForm()));
      setStaffForm((current) => (current.id ? current : emptyStaffForm(nextRoles[0]?.id ? [nextRoles[0].id] : [])));
    } catch (err) {
      showToast(err.message || 'Failed to load staff management', 'error');
    } finally {
      setLoading(false);
    }
  }, [saFetch, showToast]);

  const fetchStaffUsers = useCallback(async (page, overrides = {}) => {
    const q = overrides.q !== undefined ? overrides.q : staffQDebounced;
    const status = overrides.status !== undefined ? overrides.status : staffStatus;
    const roleId = overrides.roleId !== undefined ? overrides.roleId : staffRoleFilter;

    const params = new URLSearchParams();
    params.set('limit', String(STAFF_PAGE_SIZE));
    params.set('page', String(page));
    if (q.trim()) params.set('q', q.trim());
    if (status && status !== 'all') params.set('status', status);
    if (roleId) params.set('roleId', roleId);

    setLoadingStaff(true);
    try {
      const res = await saFetch(`/staff/users?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load staff');
      setStaffRows(Array.isArray(data.rows) ? data.rows : []);
      setStaffTotal(Number(data.total) || 0);
      setStaffPage(Number(data.page) || page);
      setStaffTotalPages(Math.max(1, Number(data.totalPages) || 1));
    } catch (err) {
      showToast(err.message || 'Failed to load staff', 'error');
      setStaffRows([]);
      setStaffTotal(0);
    } finally {
      setLoadingStaff(false);
    }
  }, [saFetch, showToast, staffQDebounced, staffStatus, staffRoleFilter]);

  const fetchAuditLogs = useCallback(async (page, overrides = {}) => {
    const q = overrides.q !== undefined ? overrides.q : auditQDebounced;
    const actorType = overrides.actorType !== undefined ? overrides.actorType : auditActorType;
    const action = overrides.action !== undefined ? overrides.action : auditAction;
    const targetType = overrides.targetType !== undefined ? overrides.targetType : auditTargetType;
    const dateFrom = overrides.dateFrom !== undefined ? overrides.dateFrom : auditDateFrom;
    const dateTo = overrides.dateTo !== undefined ? overrides.dateTo : auditDateTo;

    const params = new URLSearchParams();
    params.set('limit', String(AUDIT_PAGE_SIZE));
    params.set('page', String(page));
    if (q.trim()) params.set('q', q.trim());
    if (actorType) params.set('actorType', actorType);
    if (action.trim()) params.set('action', action.trim());
    if (targetType.trim()) params.set('targetType', targetType.trim());
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);

    setLoadingAudit(true);
    try {
      const res = await saFetch(`/staff/audit-logs?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load audit logs');
      setAuditRows(Array.isArray(data.rows) ? data.rows : []);
      setAuditTotal(Number(data.total) || 0);
      setAuditPage(Number(data.page) || page);
      setAuditTotalPages(Math.max(1, Number(data.totalPages) || 1));
    } catch (err) {
      showToast(err.message || 'Failed to load audit logs', 'error');
      setAuditRows([]);
      setAuditTotal(0);
    } finally {
      setLoadingAudit(false);
    }
  }, [saFetch, showToast, auditQDebounced, auditActorType, auditAction, auditTargetType, auditDateFrom, auditDateTo]);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setAuditQDebounced(auditQ);
    }, AUDIT_DEBOUNCE_MS);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [auditQ]);

  useEffect(() => {
    if (staffSearchDebounceRef.current) clearTimeout(staffSearchDebounceRef.current);
    staffSearchDebounceRef.current = setTimeout(() => {
      setStaffQDebounced(staffQ);
    }, AUDIT_DEBOUNCE_MS);
    return () => {
      if (staffSearchDebounceRef.current) clearTimeout(staffSearchDebounceRef.current);
    };
  }, [staffQ]);

  useEffect(() => {
    if (activeTab !== 'staff') return;
    setStaffPage(1);
    fetchStaffUsers(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, staffQDebounced, staffStatus, staffRoleFilter]);

  useEffect(() => {
    if (activeTab !== 'audit') {
      prevActiveTabRef.current = activeTab;
      return;
    }
    const cameFromOtherTab = prevActiveTabRef.current !== 'audit';
    prevActiveTabRef.current = 'audit';
    setAuditPage(1);
    if (cameFromOtherTab) {
      fetchAuditLogs(1);
    } else {
      fetchAuditLogs(1, { q: auditQDebounced });
    }
    // fetchAuditLogs intentionally omitted — using latest closure for filter state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, auditQDebounced]);

  const roleOptions = useMemo(() => roles.map((role) => ({ id: role.id, label: role.name })), [roles]);

  const handleSelectRole = (role) => {
    setDeletingRoleId(null);
    setReplacementRoleId('');
    setRoleForm({
      id: role.id,
      name: role.name,
      description: role.description || '',
      permissions: buildRolePermissionForm(role.permissions),
    });
  };

  const resetRoleForm = () => {
    setDeletingRoleId(null);
    setReplacementRoleId('');
    setRoleForm(emptyRoleForm());
  };

  const handleSelectStaff = (row) => {
    setStaffForm({
      id: row.id,
      name: row.full_name,
      email: row.email,
      roleIds: parseStaffRowRoleIds(row),
      isActive: Boolean(row.is_active),
    });
  };

  const toggleStaffRole = (roleId, checked) => {
    const id = String(roleId);
    setStaffForm((current) => {
      const set = new Set((current.roleIds || []).map(String));
      if (checked) set.add(id);
      else set.delete(id);
      return { ...current, roleIds: Array.from(set) };
    });
  };

  const refreshAll = async () => {
    await loadCore();
    if (activeTab === 'audit') await fetchAuditLogs(auditPage);
    if (activeTab === 'staff') await fetchStaffUsers(staffPage);
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
          permissions: expandRolePermissionForm(roleForm.permissions),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save role');
      showToast(roleForm.id ? 'Role updated' : 'Role created', 'success');
      setRoleForm(emptyRoleForm());
      await loadCore();
      if (activeTab === 'staff') await fetchStaffUsers(staffPage);
      if (activeTab === 'audit') await fetchAuditLogs(auditPage);
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
      await loadCore();
      if (activeTab === 'staff') await fetchStaffUsers(staffPage);
      if (activeTab === 'audit') await fetchAuditLogs(auditPage);
    } catch (err) {
      showToast(err.message || 'Failed to delete role', 'error');
    }
  };

  const saveStaff = async (event) => {
    event.preventDefault();
    if (!staffForm.roleIds?.length) {
      showToast('Select at least one role', 'error');
      return;
    }
    setSavingStaff(true);
    try {
      const method = staffForm.id ? 'PATCH' : 'POST';
      const path = staffForm.id ? `/staff/users/${staffForm.id}` : '/staff/users';
      const body = {
        name: staffForm.name.trim(),
        email: staffForm.email.trim(),
        roleIds: staffForm.roleIds,
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
      setStaffForm(emptyStaffForm(roleOptions[0]?.id ? [roleOptions[0].id] : []));
      await loadCore();
      if (activeTab === 'staff') {
        if (staffForm.id) await fetchStaffUsers(staffPage);
        else {
          setStaffPage(1);
          await fetchStaffUsers(1);
        }
      }
      if (activeTab === 'audit') await fetchAuditLogs(auditPage);
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
      await loadCore();
      if (activeTab === 'staff') await fetchStaffUsers(staffPage);
      if (activeTab === 'audit') await fetchAuditLogs(auditPage);
    } catch (err) {
      showToast(err.message || 'Failed to reset password', 'error');
    }
  };

  const deleteStaff = async (staffId) => {
    if (!window.confirm('Delete this staff user? This cannot be undone.')) return;
    try {
      const res = await saFetch(`/staff/users/${staffId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete staff user');
      showToast('Staff user deleted', 'success');
      setStaffForm(emptyStaffForm(roleOptions[0]?.id ? [roleOptions[0].id] : []));
      await loadCore();
      if (activeTab === 'staff') await fetchStaffUsers(staffPage);
      if (activeTab === 'audit') await fetchAuditLogs(auditPage);
    } catch (err) {
      showToast(err.message || 'Failed to delete staff user', 'error');
    }
  };

  const applyAuditFilters = () => {
    setAuditPage(1);
    fetchAuditLogs(1);
  };

  const goAuditPage = (p) => {
    const next = Math.max(1, Math.min(auditTotalPages, p));
    setAuditPage(next);
    fetchAuditLogs(next);
  };

  const goStaffPage = (p) => {
    const next = Math.max(1, Math.min(staffTotalPages, p));
    setStaffPage(next);
    fetchStaffUsers(next);
  };

  if (loading) return <div className="sa-loading">Loading staff management…</div>;

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <div>
          <h2 className="sa-page-title">Staff Management</h2>
          <p className="sa-text-muted sa-mb">
            Create staff roles, assign module permissions, invite team members, and review access activity.
          </p>
        </div>
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={refreshAll}>Refresh</button>
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

      <div className="sa-tabs" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`sa-tab ${activeTab === t.id ? 'sa-tab-active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'roles' ? (
        <div className="sa-panel">
          <div className="sa-panel-header-row">
            <h3 className="sa-panel-title">Role Management</h3>
            <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={resetRoleForm}>New role</button>
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
                {DISPLAY_PERMISSION_MODULES.map((moduleDef) => (
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
              <button type="button" className="sa-btn sa-btn-ghost" onClick={resetRoleForm}>Reset all</button>
              {roleForm.id ? <button type="button" className="sa-btn sa-btn-danger" disabled={!canDelete} onClick={() => deletingRoleId === roleForm.id ? removeRole() : setDeletingRoleId(roleForm.id)}>{deletingRoleId === roleForm.id ? 'Confirm delete' : 'Delete role'}</button> : null}
            </div>
          </form>
        </div>
      ) : null}

      {activeTab === 'staff' ? (
        <div className="sa-panel">
          <div className="sa-panel-header-row">
            <h3 className="sa-panel-title">Staff Directory</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span className="sa-text-muted" style={{ fontSize: 13 }}>
                {loadingStaff ? 'Loading…' : `${staffTotal} staff · page ${staffPage} of ${staffTotalPages}`}
              </span>
              <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setStaffForm(emptyStaffForm(roleOptions[0]?.id ? [roleOptions[0].id] : []))}>Add staff</button>
            </div>
          </div>

          <div className="sa-staff-directory-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
            <div className="sa-field" style={{ flex: '1 1 200px', minWidth: 160 }}>
              <label>Search</label>
              <input
                type="search"
                placeholder="Name or email…"
                value={staffQ}
                onChange={(e) => setStaffQ(e.target.value)}
                style={{ color: 'var(--sa-text)', background: 'var(--sa-surface)' }}
              />
            </div>
            <div className="sa-field" style={{ minWidth: 140 }}>
              <label>Status</label>
              <select
                value={staffStatus}
                onChange={(e) => setStaffStatus(e.target.value)}
                style={{ color: 'var(--sa-text)', background: 'var(--sa-surface)' }}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="sa-field" style={{ minWidth: 180 }}>
              <label>Role</label>
              <select
                value={staffRoleFilter}
                onChange={(e) => setStaffRoleFilter(e.target.value)}
                style={{ color: 'var(--sa-text)', background: 'var(--sa-surface)' }}
              >
                <option value="">Any role</option>
                {roleOptions.map((role) => (
                  <option key={role.id} value={role.id}>{role.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="sa-table-wrap" style={{ marginBottom: 16 }}>
            <table className="sa-table">
              <thead>
                <tr><th>Name</th><th>Roles</th><th>Status</th><th>Last login</th><th style={{ width: 1 }}>Actions</th></tr>
              </thead>
              <tbody>
                {loadingStaff && staffRows.length === 0 ? (
                  <tr><td colSpan={5} className="sa-text-muted" style={{ textAlign: 'center' }}>Loading…</td></tr>
                ) : null}
                {!loadingStaff && staffRows.length === 0 ? (
                  <tr><td colSpan={5} className="sa-text-muted" style={{ textAlign: 'center' }}>No staff match your filters.</td></tr>
                ) : null}
                {staffRows.map((row) => (
                  <tr
                    key={row.id}
                    className={staffForm.id === row.id ? 'sa-selectable-row is-selected' : 'sa-selectable-row'}
                    onClick={() => handleSelectStaff(row)}
                  >
                    <td>{row.full_name}<div className="sa-table-subtext">{row.email}</div></td>
                    <td>{row.role_name?.trim() ? row.role_name : 'Unassigned'}</td>
                    <td>{row.is_active ? 'Active' : 'Inactive'}{row.must_change_password ? ' · reset pending' : ''}</td>
                    <td>{row.last_login_at ? new Date(row.last_login_at).toLocaleString() : 'Never'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => handleSelectStaff(row)}>Edit</button>
                        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={!canEdit} onClick={() => resetPassword(row.id)}>Reset pwd</button>
                        <button type="button" className="sa-btn sa-btn-danger sa-btn-sm" disabled={!canDelete} onClick={() => deleteStaff(row.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sa-pagination-bar" style={{ marginBottom: 16 }}>
            <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={loadingStaff || staffPage <= 1} onClick={() => goStaffPage(staffPage - 1)}>
              Previous
            </button>
            <span className="sa-text-muted" style={{ fontSize: 13 }}>
              Page {staffPage} / {staffTotalPages}
            </span>
            <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={loadingStaff || staffPage >= staffTotalPages} onClick={() => goStaffPage(staffPage + 1)}>
              Next
            </button>
          </div>

          <form onSubmit={saveStaff}>
            <div className="sa-field"><label>Name</label><input type="text" value={staffForm.name} onChange={(e) => setStaffForm((current) => ({ ...current, name: e.target.value }))} disabled={!canEdit} required /></div>
            <div className="sa-field"><label>Email</label><input type="email" value={staffForm.email} onChange={(e) => setStaffForm((current) => ({ ...current, email: e.target.value }))} disabled={!canEdit} required /></div>
            <div className="sa-field">
              <label>Roles</label>
              <p className="sa-text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                One or more roles. Effective permissions use the highest access level per module across all selected roles.
              </p>
              <div style={{ display: 'grid', gap: 8, maxHeight: 240, overflowY: 'auto', marginTop: 8 }}>
                {roleOptions.length === 0 ? (
                  <span className="sa-text-muted" style={{ fontSize: 13 }}>Create a role first.</span>
                ) : (
                  roleOptions.map((role) => (
                    <label key={role.id} className="sa-field-check">
                      <input
                        type="checkbox"
                        checked={staffForm.roleIds.map(String).includes(String(role.id))}
                        onChange={(e) => toggleStaffRole(role.id, e.target.checked)}
                        disabled={!canEdit}
                      />
                      <span>{role.label}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="sa-field-check"><label><input type="checkbox" checked={staffForm.isActive} onChange={(e) => setStaffForm((current) => ({ ...current, isActive: e.target.checked }))} disabled={!canEdit} />Staff account active</label></div>

            <div className="sa-field-actions">
              <button type="submit" className="sa-btn sa-btn-primary" disabled={!canEdit || savingStaff}>{savingStaff ? 'Saving…' : staffForm.id ? 'Save staff user' : 'Create staff user'}</button>
              {staffForm.id ? <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setStaffForm(emptyStaffForm(roleOptions[0]?.id ? [roleOptions[0].id] : []))}>Reset</button> : null}
              {staffForm.id ? <button type="button" className="sa-btn sa-btn-ghost" disabled={!canEdit} onClick={() => resetPassword(staffForm.id)}>Reset password</button> : null}
              {staffForm.id ? <button type="button" className="sa-btn sa-btn-danger" disabled={!canDelete} onClick={() => deleteStaff(staffForm.id)}>Delete staff</button> : null}
            </div>
          </form>
        </div>
      ) : null}

      {activeTab === 'audit' ? (
        <div className="sa-panel">
          <div className="sa-panel-header-row">
            <h3 className="sa-panel-title">Audit Logs</h3>
            <div className="sa-text-muted" style={{ fontSize: 13 }}>
              {loadingAudit ? 'Loading…' : `${auditTotal} event${auditTotal === 1 ? '' : 's'} · page ${auditPage} of ${auditTotalPages}`}
            </div>
          </div>

          <div className="sa-staff-audit-filters">
            <div className="sa-field sa-field-inline-grow">
              <label>Search</label>
              <input
                type="search"
                placeholder="Actor, action, target…"
                value={auditQ}
                onChange={(e) => setAuditQ(e.target.value)}
                style={{ color: 'var(--sa-text)', background: 'var(--sa-surface)' }}
              />
            </div>
            <div className="sa-field">
              <label>Actor type</label>
              <select
                value={auditActorType}
                onChange={(e) => setAuditActorType(e.target.value)}
                style={{ color: 'var(--sa-text)', background: 'var(--sa-surface)' }}
              >
                <option value="">All</option>
                <option value="super_admin">Super admin</option>
                <option value="staff">Staff</option>
                <option value="system">System</option>
              </select>
            </div>
            <div className="sa-field">
              <label>Action contains</label>
              <input
                type="text"
                value={auditAction}
                onChange={(e) => setAuditAction(e.target.value)}
                placeholder="e.g. auth.login"
                style={{ color: 'var(--sa-text)', background: 'var(--sa-surface)' }}
              />
            </div>
            <div className="sa-field">
              <label>Target type contains</label>
              <input
                type="text"
                value={auditTargetType}
                onChange={(e) => setAuditTargetType(e.target.value)}
                placeholder="e.g. staff_user"
                style={{ color: 'var(--sa-text)', background: 'var(--sa-surface)' }}
              />
            </div>
            <div className="sa-field">
              <label>From date</label>
              <input
                type="date"
                value={auditDateFrom}
                onChange={(e) => setAuditDateFrom(e.target.value)}
                style={{ color: 'var(--sa-text)', background: 'var(--sa-surface)' }}
              />
            </div>
            <div className="sa-field">
              <label>To date</label>
              <input
                type="date"
                value={auditDateTo}
                onChange={(e) => setAuditDateTo(e.target.value)}
                style={{ color: 'var(--sa-text)', background: 'var(--sa-surface)' }}
              />
            </div>
            <div className="sa-field sa-field-actions-inline">
              <label className="sa-label-spacer" aria-hidden="true">&nbsp;</label>
              <button type="button" className="sa-btn sa-btn-primary sa-audit-filter-button" onClick={applyAuditFilters} disabled={loadingAudit}>
                Apply filters
              </button>
            </div>
          </div>

          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th></tr>
              </thead>
              <tbody>
                {loadingAudit && auditRows.length === 0 ? (
                  <tr><td colSpan={4} className="sa-text-muted" style={{ textAlign: 'center' }}>Loading…</td></tr>
                ) : null}
                {!loadingAudit && auditRows.length === 0 ? (
                  <tr><td colSpan={4} className="sa-text-muted" style={{ textAlign: 'center' }}>No audit events match your filters.</td></tr>
                ) : null}
                {auditRows.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.created_at).toLocaleString()}</td>
                    <td>
                      <div>{row.actor_label}</div>
                      <div className="sa-table-subtext">{row.actor_type || '—'}</div>
                    </td>
                    <td>{row.action}</td>
                    <td>{row.target_label || row.target_type || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sa-pagination-bar">
            <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={loadingAudit || auditPage <= 1} onClick={() => goAuditPage(auditPage - 1)}>
              Previous
            </button>
            <span className="sa-text-muted" style={{ fontSize: 13 }}>
              Page {auditPage} / {auditTotalPages}
            </span>
            <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={loadingAudit || auditPage >= auditTotalPages} onClick={() => goAuditPage(auditPage + 1)}>
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
