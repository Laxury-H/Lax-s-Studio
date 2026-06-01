import React, { useState } from 'react';
import { User, Shield, Key, Camera, Check, X, ShieldAlert, Smartphone } from 'lucide-react';
import { useUser } from '../App';

export default function ProfileView() {
  const { user, mutateUser } = useUser();
  const [activeTab, setActiveTab] = useState<'general' | 'security'>('general');
  const [isEditing, setIsEditing] = useState(false);
  
  // General State
  const [name, setName] = useState(user?.name || '');
  const [avatar, setAvatar] = useState(user?.avatar_url || '');
  
  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  // 2FA State
  const [qrCode, setQrCode] = useState('');
  const [twoFaToken, setTwoFaToken] = useState('');
  const [twoFaSetup, setTwoFaSetup] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, avatar_url: avatar })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      mutateUser();
      setIsEditing(false);
      showMessage('Profile updated successfully', 'success');
    } catch (err: any) {
      showMessage(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCurrentPassword('');
      setNewPassword('');
      showMessage('Password changed successfully', 'success');
    } catch (err: any) {
      showMessage(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const generate2FA = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/generate', { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQrCode(data.qrCodeDataUrl);
      setTwoFaSetup(true);
    } catch (err: any) {
      showMessage(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const enable2FA = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: twoFaToken })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      mutateUser();
      setTwoFaSetup(false);
      showMessage('2FA enabled successfully', 'success');
    } catch (err: any) {
      showMessage(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const disable2FA = async () => {
    const pwd = prompt("Please enter your password to disable 2FA:");
    if (!pwd) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      mutateUser();
      showMessage('2FA disabled', 'success');
    } catch (err: any) {
      showMessage(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 animate-in fade-in zoom-in duration-300">
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-primary/20 p-2 rounded-xl">
          <User className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black italic tracking-tight">PROFILE MANAGEMENT</h1>
          <p className="text-xs text-muted-fg font-bold tracking-wider uppercase">Manage your account settings</p>
        </div>
      </div>

      {message.text && (
        <div className={`mb-6 p-4 rounded-xl border font-bold text-sm ${message.type === 'error' ? 'bg-danger/10 text-danger border-danger/20' : 'bg-success/10 text-success border-success/20'}`}>
          {message.text}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <div className="w-full md:w-64 space-y-2">
          <button
            onClick={() => setActiveTab('general')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-colors ${activeTab === 'general' ? 'bg-primary text-primary-fg' : 'hover:bg-muted text-muted-fg'}`}
          >
            <User className="w-4 h-4" />
            General Info
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-colors ${activeTab === 'security' ? 'bg-primary text-primary-fg' : 'hover:bg-muted text-muted-fg'}`}
          >
            <Shield className="w-4 h-4" />
            Security & 2FA
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 bg-card border border-border rounded-2xl p-6 shadow-xl">
          {activeTab === 'general' ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <h2 className="text-lg font-black uppercase tracking-wider">Personal Information</h2>
                {!isEditing ? (
                  <button onClick={() => setIsEditing(true)} className="text-primary text-sm font-bold hover:underline">Edit</button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setIsEditing(false)} className="text-muted-fg text-sm font-bold hover:underline">Cancel</button>
                    <button onClick={handleUpdateProfile} disabled={loading} className="text-primary text-sm font-bold hover:underline">Save</button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-6">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-border">
                    {avatar ? <img src={avatar} alt="Avatar" className="w-full h-full object-cover" /> : <User className="w-10 h-10 text-muted-fg" />}
                  </div>
                  {isEditing && (
                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <label className="text-xs font-bold text-muted-fg uppercase tracking-wider block mb-1">Email Address</label>
                    <input type="text" value={user.email} disabled className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-muted-fg font-medium" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-fg uppercase tracking-wider block mb-1">Display Name</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} disabled={!isEditing} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-primary disabled:bg-muted disabled:text-muted-fg" />
                  </div>
                  {isEditing && (
                    <div>
                      <label className="text-xs font-bold text-muted-fg uppercase tracking-wider block mb-1">Avatar URL</label>
                      <input type="text" value={avatar} onChange={e => setAvatar(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-primary" placeholder="https://..." />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Change Password */}
              <div className="space-y-4">
                <h2 className="text-lg font-black uppercase tracking-wider flex items-center gap-2 border-b border-border pb-2">
                  <Key className="w-5 h-5 text-primary" /> Change Password
                </h2>
                <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
                  <div>
                    <input type="password" placeholder="Current Password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-primary" required />
                  </div>
                  <div>
                    <input type="password" placeholder="New Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-primary" required minLength={8} />
                  </div>
                  <button type="submit" disabled={loading} className="brutalist-btn px-4 py-2 text-sm">Update Password</button>
                </form>
              </div>

              {/* 2FA Section */}
              <div className="space-y-4">
                <h2 className="text-lg font-black uppercase tracking-wider flex items-center gap-2 border-b border-border pb-2">
                  <ShieldAlert className="w-5 h-5 text-primary" /> Two-Factor Authentication
                </h2>
                <p className="text-sm text-muted-fg font-medium">Add an extra layer of security to your account using an authenticator app like Google Authenticator.</p>
                
                {user.two_factor_enabled ? (
                  <div className="bg-success/10 border border-success/20 p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Check className="w-5 h-5 text-success" />
                      <span className="font-bold text-success">2FA is currently enabled</span>
                    </div>
                    <button onClick={disable2FA} disabled={loading} className="text-danger text-sm font-bold hover:underline">Disable</button>
                  </div>
                ) : (
                  <div>
                    {!twoFaSetup ? (
                      <button onClick={generate2FA} disabled={loading} className="brutalist-btn px-4 py-2 text-sm flex items-center gap-2">
                        <Smartphone className="w-4 h-4" /> Enable 2FA
                      </button>
                    ) : (
                      <div className="bg-muted p-6 rounded-xl space-y-4 border border-border text-center max-w-sm mx-auto">
                        <p className="text-sm font-bold text-foreground">1. Scan this QR code with your app:</p>
                        <img src={qrCode} alt="2FA QR Code" className="mx-auto border-4 border-white rounded-lg shadow-xl" />
                        <p className="text-sm font-bold text-foreground mt-4">2. Enter the 6-digit code:</p>
                        <input type="text" placeholder="000000" value={twoFaToken} onChange={e => setTwoFaToken(e.target.value)} className="w-full text-center tracking-[0.5em] font-mono text-xl bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-primary" maxLength={6} />
                        <div className="flex gap-2 justify-center pt-2">
                          <button onClick={() => setTwoFaSetup(false)} className="px-4 py-2 text-sm font-bold text-muted-fg hover:text-foreground">Cancel</button>
                          <button onClick={enable2FA} disabled={twoFaToken.length !== 6 || loading} className="brutalist-btn px-4 py-2 text-sm">Verify & Enable</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
