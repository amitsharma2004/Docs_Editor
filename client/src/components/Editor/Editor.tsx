import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { useAuth } from '../../context/AuthContext';
import { useOTSocket } from '../../hooks/useOTSocket';
import { QuillDelta } from '../../lib/ot-client';
import { api } from '../../services/api';

interface Presence {
  userId: string;
  name: string;
  cursor?: number;
}

const COLORS = ['#1a73e8', '#e8710a', '#188038', '#a142f4', '#d93025'];

const Editor: React.FC = () => {
  const { docId } = useParams<{ docId: string }>();
  const { user, accessToken, logout } = useAuth();
  const navigate = useNavigate();

  const [content, setContent] = useState('');
  const [title, setTitle] = useState('Untitled Document');
  const [editingTitle, setEditingTitle] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [connStatus, setConnStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [presence, setPresence] = useState<Presence[]>([]);

  const revisionRef = useRef(0);
  const isRemoteChangeRef = useRef(false);
  const quillRef = useRef<ReactQuill>(null);

  // Load initial document via REST
  useEffect(() => {
    if (!docId) return;
    api.get(`/documents/${docId}`).then((res) => {
      setTitle(res.data.title);
    }).catch(() => navigate('/'));
  }, [docId, navigate]);

  const handleOperation = useCallback((op: QuillDelta, revision: number) => {
    isRemoteChangeRef.current = true;
    revisionRef.current = revision;
    const quill = quillRef.current?.getEditor();
    if (quill && op.ops) {
      try {
        quill.updateContents(op as Parameters<typeof quill.updateContents>[0]);
        setContent(JSON.stringify(quill.getContents()));
      } catch { /* ignore invalid deltas */ }
    }
    setTimeout(() => { isRemoteChangeRef.current = false; }, 0);
  }, []);

  const handleDocumentLoaded = useCallback((serverContent: string, revision: number) => {
    revisionRef.current = revision;
    isRemoteChangeRef.current = true;
    const quill = quillRef.current?.getEditor();
    if (quill && serverContent) {
      try {
        const delta = JSON.parse(serverContent) as QuillDelta;
        quill.setContents(delta as Parameters<typeof quill.setContents>[0]);
        setContent(serverContent);
      } catch { /* ignore parse errors */ }
    }
    setTimeout(() => { isRemoteChangeRef.current = false; }, 0);
    setConnStatus('connected');
  }, []);

  const handlePresenceUpdate = useCallback((users: Presence[]) => {
    setPresence(users.filter((u) => u.userId !== user?._id));
  }, [user]);

  const handleCursorUpdate = useCallback((_userId: string, _position: number) => {
    // Cursor rendering can be enhanced with Quill's cursor module
  }, []);

  const { sendOperation, sendCursorUpdate, isConnected } = useOTSocket({
    docId: docId!,
    token: accessToken!,
    onOperation: handleOperation,
    onPresenceUpdate: handlePresenceUpdate,
    onDocumentLoaded: handleDocumentLoaded,
    onCursorUpdate: handleCursorUpdate,
  });

  useEffect(() => {
    setConnStatus(isConnected ? 'connected' : 'disconnected');
  }, [isConnected]);

  // Handle local editor changes
  const handleChange = useCallback(
    (_value: string, delta: unknown, source: string) => {
      if (source !== 'user' || isRemoteChangeRef.current) return;

      const quillDelta = delta as QuillDelta;
      if (!quillDelta.ops || quillDelta.ops.length === 0) return;

      setSaveStatus('saving');
      sendOperation(quillDelta, revisionRef.current);

      const quill = quillRef.current?.getEditor();
      if (quill) setContent(JSON.stringify(quill.getContents()));
    },
    [sendOperation]
  );

  // Handle cursor position change
  const handleSelectionChange = useCallback(
    (range: { index: number } | null) => {
      if (range) sendCursorUpdate(range.index);
    },
    [sendCursorUpdate]
  );

  const handleTitleSave = async () => {
    setEditingTitle(false);
    try {
      await api.patch(`/documents/${docId}`, { title });
    } catch { /* ignore title update errors */ }
  };

  const modules = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ color: [] }, { background: [] }],
      [{ list: 'ordered' }, { list: 'bullet' }],
      [{ indent: '-1' }, { indent: '+1' }],
      ['link', 'blockquote', 'code-block'],
      ['clean'],
    ],
  };

  return (
    <div style={styles.page}>
      {/* Topbar */}
      <header style={styles.topbar}>
        <div style={styles.topbarLeft}>
          <span style={styles.logo} onClick={() => navigate('/')}>📄</span>
          {editingTitle ? (
            <input
              style={styles.titleInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
              autoFocus
            />
          ) : (
            <span style={styles.titleDisplay} onClick={() => setEditingTitle(true)}>{title}</span>
          )}
          <span style={{ ...styles.saveStatus, color: saveStatus === 'saved' ? '#188038' : '#5f6368' }}>
            {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
          </span>
        </div>
        <div style={styles.topbarRight}>
          {/* Presence avatars */}
          {presence.slice(0, 5).map((p, i) => (
            <div
              key={p.userId}
              title={p.name}
              style={{ ...styles.avatar, background: COLORS[i % COLORS.length] }}
            >
              {p.name.charAt(0).toUpperCase()}
            </div>
          ))}
          <span style={{ ...styles.connDot, background: connStatus === 'connected' ? '#188038' : '#d93025' }} title={connStatus} />
          <button style={styles.logoutBtn} onClick={logout}>Sign out</button>
        </div>
      </header>

      {/* Editor area */}
      <div style={styles.editorWrapper}>
        <div style={styles.page_body}>
          <ReactQuill
            ref={quillRef}
            theme="snow"
            value={content}
            onChange={handleChange}
            onChangeSelection={handleSelectionChange}
            modules={modules}
            style={styles.quill}
          />
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8f9fa' },
  topbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: '#fff', borderBottom: '1px solid #e0e0e0', height: 60, flexShrink: 0 },
  topbarLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  logo: { fontSize: 32, cursor: 'pointer' },
  titleInput: { fontSize: 18, border: '1px solid #1a73e8', borderRadius: 4, padding: '4px 8px', outline: 'none', minWidth: 200 },
  titleDisplay: { fontSize: 18, cursor: 'pointer', color: '#202124', fontWeight: 400, padding: '4px 8px', borderRadius: 4 },
  saveStatus: { fontSize: 12, color: '#5f6368' },
  topbarRight: { display: 'flex', alignItems: 'center', gap: 8 },
  avatar: { width: 32, height: 32, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600 },
  connDot: { width: 10, height: 10, borderRadius: '50%', display: 'inline-block' },
  logoutBtn: { background: 'none', border: '1px solid #dadce0', borderRadius: 4, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: '#1a73e8' },
  editorWrapper: { flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: '40px 16px', background: '#f8f9fa' },
  page_body: { background: '#fff', width: '816px', minHeight: '1056px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', padding: '72px 72px' },
  quill: { height: '100%' },
};

export default Editor;
