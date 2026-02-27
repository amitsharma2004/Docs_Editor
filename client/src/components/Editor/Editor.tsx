import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import Delta from 'quill-delta';
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
const DEBOUNCE_DELAY = 300; // milliseconds - reduced for better save reliability

const Editor: React.FC = () => {
  const { docId } = useParams<{ docId?: string; slug?: string }>();
  const { user, accessToken, logout } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState('Untitled Document');
  const [slug, setSlug] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [connStatus, setConnStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [presence, setPresence] = useState<Presence[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareRole, setShareRole] = useState<'editor' | 'viewer'>('editor');
  const [shareLink, setShareLink] = useState('');

  const revisionRef = useRef(0);
  const isRemoteChangeRef = useRef(false);
  const quillRef = useRef<ReactQuill>(null);
  const pendingOpsRef = useRef<QuillDelta[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Load initial document via REST
  useEffect(() => {
    if (!docId) return;
    api.get(`/documents/${docId}`).then((res) => {
      setTitle(res.data.title);
      if (res.data.slug) {
        setSlug(res.data.slug);
        setShareLink(`${window.location.origin}/doc/${res.data.slug}`);
      } else {
        // If no slug exists, generate one by updating the title
        api.patch(`/documents/${docId}`, { title: res.data.title }).then((updateRes) => {
          setSlug(updateRes.data.slug);
          setShareLink(`${window.location.origin}/doc/${updateRes.data.slug}`);
        });
      }
    }).catch(() => navigate('/'));
  }, [docId, navigate]);

  const handleOperation = useCallback((op: QuillDelta, revision: number) => {
    isRemoteChangeRef.current = true;
    revisionRef.current = revision;
    const quill = quillRef.current?.getEditor();
    if (quill && op.ops) {
      try {
        quill.updateContents(op as Parameters<typeof quill.updateContents>[0]);
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
      } catch (err) {
        console.error('Failed to parse document content:', err);
      }
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

  // Flush pending operations
  const flushPendingOps = useCallback(() => {
    if (pendingOpsRef.current.length === 0) return;

    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    // Properly compose all pending operations using Quill Delta
    let composedDelta = new Delta(pendingOpsRef.current[0].ops as any);
    for (let i = 1; i < pendingOpsRef.current.length; i++) {
      const nextDelta = new Delta(pendingOpsRef.current[i].ops as any);
      composedDelta = composedDelta.compose(nextDelta);
    }

    // Convert back to plain object with proper typing
    const finalOp: QuillDelta = { 
      ops: composedDelta.ops as QuillDelta['ops']
    };
    
    sendOperation(finalOp, revisionRef.current);
    pendingOpsRef.current = [];
    
    setTimeout(() => setSaveStatus('saved'), 200);
  }, [sendOperation]);

  // Cleanup timer on unmount and flush pending ops
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      // Flush any pending operations before unmount
      if (pendingOpsRef.current.length > 0) {
        flushPendingOps();
      }
    };
  }, [flushPendingOps]);

  // Keyboard shortcut for manual save (Ctrl+S / Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        if (pendingOpsRef.current.length > 0) {
          flushPendingOps();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flushPendingOps]);

  // Flush pending operations before page unload (refresh, close, navigate)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingOpsRef.current.length > 0) {
        // Clear the debounce timer
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        
        // Immediately flush pending operations
        flushPendingOps();
        
        // Show warning to give time for the operation to send
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    // Also handle visibility change (tab switching, minimizing)
    const handleVisibilityChange = () => {
      if (document.hidden && pendingOpsRef.current.length > 0) {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        flushPendingOps();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [flushPendingOps]);

  // Handle local editor changes with debouncing
  const handleChange = useCallback(
    (_value: string, delta: unknown, source: string) => {
      if (source !== 'user' || isRemoteChangeRef.current) return;

      const quillDelta = delta as QuillDelta;
      if (!quillDelta.ops || quillDelta.ops.length === 0) return;

      // Add to pending operations
      pendingOpsRef.current.push(quillDelta);
      setSaveStatus('saving');

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new timer to flush operations
      debounceTimerRef.current = setTimeout(() => {
        flushPendingOps();
      }, DEBOUNCE_DELAY);
    },
    [flushPendingOps]
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
      const res = await api.patch(`/documents/${docId}`, { title });
      setSlug(res.data.slug);
      setShareLink(`${window.location.origin}/doc/${res.data.slug}`);
    } catch { /* ignore title update errors */ }
  };

  const handleShare = async () => {
    try {
      await api.post(`/documents/${docId}/share`, { email: shareEmail, role: shareRole });
      alert(`Document shared with ${shareEmail} as ${shareRole}`);
      setShareEmail('');
      setShowShareModal(false);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to share document');
    }
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink);
    alert('Link copied to clipboard!');
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
          <button style={styles.shareBtn} onClick={() => setShowShareModal(true)}>Share</button>
          <button style={styles.logoutBtn} onClick={logout}>Sign out</button>
        </div>
      </header>

      {/* Share Modal */}
      {showShareModal && (
        <div style={styles.modalOverlay} onClick={() => setShowShareModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Share Document</h2>
            
            <div style={styles.modalSection}>
              <label style={styles.label}>Share Link</label>
              <div style={styles.linkContainer}>
                <input 
                  style={styles.linkInput} 
                  value={shareLink} 
                  readOnly 
                />
                <button style={styles.copyBtn} onClick={copyShareLink}>Copy</button>
              </div>
            </div>

            <div style={styles.modalSection}>
              <label style={styles.label}>Invite by Email</label>
              <input
                style={styles.input}
                type="email"
                placeholder="Enter email address"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
              />
              <select 
                style={styles.select} 
                value={shareRole} 
                onChange={(e) => setShareRole(e.target.value as 'editor' | 'viewer')}
              >
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <button style={styles.inviteBtn} onClick={handleShare}>Send Invite</button>
            </div>

            <button style={styles.closeBtn} onClick={() => setShowShareModal(false)}>Close</button>
          </div>
        </div>
      )}

      {/* Editor area */}
      <div style={styles.editorWrapper}>
        <div style={styles.page_body}>
          <ReactQuill
            ref={quillRef}
            theme="snow"
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
  shareBtn: { background: '#1a73e8', border: 'none', borderRadius: 4, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 500 },
  logoutBtn: { background: 'none', border: '1px solid #dadce0', borderRadius: 4, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: '#1a73e8' },
  editorWrapper: { flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: '40px 16px', background: '#f8f9fa' },
  page_body: { background: '#fff', width: '816px', minHeight: '1056px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', padding: '72px 72px' },
  quill: { height: '100%' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 8, padding: 24, width: 500, maxWidth: '90%', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' },
  modalTitle: { margin: '0 0 20px 0', fontSize: 20, color: '#202124' },
  modalSection: { marginBottom: 20 },
  label: { display: 'block', fontSize: 14, color: '#5f6368', marginBottom: 8, fontWeight: 500 },
  linkContainer: { display: 'flex', gap: 8 },
  linkInput: { flex: 1, padding: '8px 12px', border: '1px solid #dadce0', borderRadius: 4, fontSize: 14, outline: 'none' },
  copyBtn: { background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 500 },
  input: { width: '100%', padding: '8px 12px', border: '1px solid #dadce0', borderRadius: 4, fontSize: 14, outline: 'none', marginBottom: 8, boxSizing: 'border-box' },
  select: { width: '100%', padding: '8px 12px', border: '1px solid #dadce0', borderRadius: 4, fontSize: 14, outline: 'none', marginBottom: 8, boxSizing: 'border-box' },
  inviteBtn: { background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 500, width: '100%' },
  closeBtn: { background: 'none', border: '1px solid #dadce0', borderRadius: 4, padding: '8px 16px', cursor: 'pointer', fontSize: 14, color: '#5f6368', width: '100%', marginTop: 12 },
};

export default Editor;
