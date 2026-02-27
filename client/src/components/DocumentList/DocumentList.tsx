import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface Doc {
  _id: string;
  title: string;
  updatedAt: string;
  ownerId: string;
}

const DocumentList: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await api.get('/documents');
      setDocs(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const createDoc = async () => {
    setCreating(true);
    try {
      const res = await api.post('/documents', { title: 'Untitled Document' });
      navigate(`/document/${res.data._id}`);
    } finally {
      setCreating(false);
    }
  };

  const deleteDoc = async (id: string, ownerId: string) => {
    if (ownerId !== user?._id) return alert('Only the owner can delete this document.');
    if (!confirm('Delete this document?')) return;
    await api.delete(`/documents/${id}`);
    setDocs((prev) => prev.filter((d) => d._id !== id));
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (loading) return <div style={styles.loading}>Loading...</div>;

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerIcon}>📄</span>
          <span style={styles.headerTitle}>Docs</span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.userName}>{user?.name}</span>
          <button style={styles.logoutBtn} onClick={logout}>Sign out</button>
        </div>
      </header>

      {/* Create New */}
      <div style={styles.createSection}>
        <p style={styles.sectionLabel}>Start a new document</p>
        <div style={styles.newDocCard} onClick={createDoc} role="button" tabIndex={0}>
          {creating ? '...' : <span style={styles.plusIcon}>+</span>}
        </div>
        <p style={styles.newDocLabel}>Blank</p>
      </div>

      {/* Recent Docs */}
      <div style={styles.listSection}>
        <p style={styles.sectionLabel}>Recent documents</p>
        {docs.length === 0 ? (
          <p style={styles.empty}>No documents yet. Create one above.</p>
        ) : (
          <div style={styles.grid}>
            {docs.map((doc) => (
              <div key={doc._id} style={styles.docCard}>
                <div style={styles.docPreview} onClick={() => navigate(`/document/${doc._id}`)}>
                  <span style={styles.docIcon}>📝</span>
                </div>
                <div style={styles.docInfo}>
                  <span style={styles.docTitle} onClick={() => navigate(`/document/${doc._id}`)}>
                    {doc.title}
                  </span>
                  <span style={styles.docDate}>{formatDate(doc.updatedAt)}</span>
                  {doc.ownerId === user?._id && (
                    <button style={styles.deleteBtn} onClick={() => deleteDoc(doc._id, doc.ownerId)}>🗑</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f8f9fa' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: '#fff', borderBottom: '1px solid #e0e0e0', position: 'sticky', top: 0, zIndex: 10 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  headerIcon: { fontSize: 28 },
  headerTitle: { fontSize: 22, color: '#5f6368', fontWeight: 400 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 16 },
  userName: { color: '#5f6368', fontSize: 14 },
  logoutBtn: { background: 'none', border: '1px solid #dadce0', borderRadius: 4, padding: '6px 14px', cursor: 'pointer', fontSize: 14, color: '#1a73e8' },
  createSection: { padding: '32px 24px 0', maxWidth: 900, margin: '0 auto' },
  sectionLabel: { fontSize: 13, color: '#5f6368', marginBottom: 12, fontWeight: 500 },
  newDocCard: { width: 120, height: 160, background: '#fff', border: '1px solid #dadce0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'box-shadow 0.2s' },
  plusIcon: { fontSize: 48, color: '#1a73e8' },
  newDocLabel: { fontSize: 12, color: '#5f6368', marginTop: 8 },
  listSection: { padding: '32px 24px', maxWidth: 900, margin: '0 auto' },
  empty: { color: '#5f6368', fontSize: 14 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 },
  docCard: { background: '#fff', borderRadius: 4, border: '1px solid #dadce0', overflow: 'hidden', cursor: 'pointer' },
  docPreview: { height: 120, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #e0e0e0' },
  docIcon: { fontSize: 48 },
  docInfo: { padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 },
  docTitle: { fontSize: 13, fontWeight: 500, color: '#202124', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  docDate: { fontSize: 11, color: '#5f6368' },
  deleteBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, alignSelf: 'flex-end', padding: 0 },
  loading: { display: 'flex', justifyContent: 'center', padding: 40, color: '#5f6368' },
};

export default DocumentList;
