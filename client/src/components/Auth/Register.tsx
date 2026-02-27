import React, { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Register: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(name, email, password);
      navigate('/');
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>📄</div>
        <h1 style={styles.title}>Create account</h1>
        <p style={styles.subtitle}>Join Docs Clone</p>
        {error && <div style={styles.error}>{error}</div>}
        <form onSubmit={handleSubmit} style={styles.form}>
          <input style={styles.input} type="text" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          <input style={styles.input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input style={styles.input} type="password" placeholder="Password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p style={styles.link}>Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8f9fa' },
  card: { background: '#fff', borderRadius: 8, padding: '48px 40px', width: 400, boxShadow: '0 2px 10px rgba(0,0,0,0.12)', textAlign: 'center' },
  logo: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 400, color: '#202124', marginBottom: 8 },
  subtitle: { color: '#5f6368', marginBottom: 24, fontSize: 14 },
  error: { background: '#fce8e6', color: '#c5221f', borderRadius: 4, padding: '10px 12px', marginBottom: 16, fontSize: 14 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: { padding: '12px 14px', border: '1px solid #dadce0', borderRadius: 4, fontSize: 16, outline: 'none' },
  button: { background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 4, padding: '12px', fontSize: 16, cursor: 'pointer', marginTop: 8 },
  link: { marginTop: 20, color: '#5f6368', fontSize: 14 },
};

export default Register;
