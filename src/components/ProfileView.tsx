import React, { useState } from 'react';
import { User, Shield, Key, Camera, Check, X, ShieldAlert, Smartphone, Save, LogOut } from 'lucide-react';

interface ProfileViewProps {
  user: any;
  onUpdateUser: () => void;
}

export default function ProfileView({ user, onUpdateUser }: ProfileViewProps) {
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
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
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
      onUpdateUser();
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
      onUpdateUser();
      setTwoFaSetup(false);
      setTwoFaToken('');
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
      onUpdateUser();
      showMessage('2FA disabled', 'success');
    } catch (err: any) {
      showMessage(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <div className="p-8 text-center text-muted-fg animate-pulse">Loading workspace profile...</div>;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 animate-in fade-in zoom-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4 mb-10 relative">
        <div className="absolute -inset-4 bg-primary/10 blur-3xl rounded-full z-0 opacity-50" />
        <div className="bg-primary/20 p-3 rounded-2xl border border-primary/20 relative z-10 backdrop-blur-xl">
          <User className="w-8 h-8 text-primary drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]" />
        </div>
        <div className="relative z-10">
          <h1 className="text-3xl font-black italic tracking-tighter bg-gradient-to-br from-foreground to-foreground/50 bg-clip-text text-transparent">
            WORKSPACE PROFILE
          </h1>
          <p className="text-sm text-primary font-bold tracking-widest uppercase mt-1">
            Secure Account Settings
          </p>
        </div>
      </div>

      {message.text && (
        <div className={`mb-8 p-4 rounded-xl border backdrop-blur-md shadow-lg flex items-center gap-3 font-bold text-sm animate-in slide-in-from-top-4 ${message.type === 'error' ? 'bg-danger/10 text-danger border-danger/20' : 'bg-success/10 text-success border-success/20'}`}>
          {message.type === 'error' ? <ShieldAlert className="w-5 h-5" /> : <Check className="w-5 h-5" />}
          {message.text}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sleek Sidebar Tabs */}
        <div className="w-full md:w-64 space-y-3 shrink-0">
          <button
            onClick={() => setActiveTab('general')}
            className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold transition-all duration-300 border ${
              activeTab === 'general' 
                ? 'bg-primary/10 border-primary/50 text-primary shadow-[0_0_20px_rgba(255,255,255,0.05)]' 
                : 'bg-card/20 border-white/5 text-muted-fg hover:bg-card/40 hover:text-foreground'
            }`}
          >
            <User className={`w-5 h-5 ${activeTab === 'general' ? 'drop-shadow-md' : ''}`} />
            General Info
          </button>
          
          <button
            onClick={() => setActiveTab('security')}
            className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold transition-all duration-300 border ${
              activeTab === 'security' 
                ? 'bg-primary/10 border-primary/50 text-primary shadow-[0_0_20px_rgba(255,255,255,0.05)]' 
                : 'bg-card/20 border-white/5 text-muted-fg hover:bg-card/40 hover:text-foreground'
            }`}
          >
            <Shield className={`w-5 h-5 ${activeTab === 'security' ? 'drop-shadow-md' : ''}`} />
            Security & 2FA
          </button>
        </div>

        {/* Premium Content Panel */}
        <div className="flex-1 bg-card/40 backdrop-blur-2xl border border-white/5 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
          {/* Subtle background glow for the active panel */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] rounded-full pointer-events-none" />

          {activeTab === 'general' ? (
            <div className="space-y-8 relative z-10 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="flex items-center justify-between border-b border-white/10 pb-6">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-widest text-foreground">Personal Information</h2>
                  <p className="text-sm text-muted-fg font-medium mt-1">Manage your identity across the workspace</p>
                </div>
                {!isEditing ? (
                  <button onClick={() => setIsEditing(true)} className="brutalist-btn px-5 py-2 text-sm flex items-center gap-2">
                    <User className="w-4 h-4" /> Edit Profile
                  </button>
                ) : (
                  <div className="flex gap-3">
                    <button onClick={() => setIsEditing(false)} className="px-5 py-2 rounded-xl text-muted-fg font-bold hover:bg-white/5 transition-colors border border-transparent">
                      Cancel
                    </button>
                    <button onClick={handleUpdateProfile} disabled={loading} className="brutalist-btn px-5 py-2 text-sm flex items-center gap-2">
                      {loading ? <div className="w-4 h-4 border-2 border-primary-fg/30 border-t-primary-fg rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                      Save Changes
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-8 items-start">
                <div className="relative group shrink-0">
                  <div className="w-32 h-32 rounded-3xl bg-background/50 flex items-center justify-center overflow-hidden border border-white/10 shadow-inner group-hover:border-primary/50 transition-colors">
                    {avatar ? (
                      <img src={avatar} alt="Avatar" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    ) : (
                      <User className="w-12 h-12 text-muted-fg" />
                    )}
                  </div>
                  {isEditing && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-all duration-300 border border-primary/50 text-primary">
                      <Camera className="w-8 h-8 mb-2" />
                      <span className="text-[10px] font-black uppercase tracking-wider">Change</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-5 w-full">
                  <div className="group">
                    <label className="text-[11px] font-black text-muted-fg uppercase tracking-widest block mb-2 group-focus-within:text-primary transition-colors">Email Address</label>
                    <div className="relative">
                      <input type="text" value={user.email} disabled className="w-full bg-background/40 border border-white/5 rounded-xl px-4 py-3.5 text-sm text-muted-fg font-medium cursor-not-allowed" />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-success/10 text-success text-[10px] font-black uppercase px-2 py-1 rounded-md border border-success/20">
                        <Check className="w-3 h-3" /> Verified
                      </div>
                    </div>
                  </div>

                  <div className="group">
                    <label className="text-[11px] font-black text-muted-fg uppercase tracking-widest block mb-2 group-focus-within:text-primary transition-colors">Display Name</label>
                    <input 
                      type="text" 
                      value={name} 
                      onChange={e => setName(e.target.value)} 
                      disabled={!isEditing} 
                      className="w-full bg-background/60 border border-white/10 rounded-xl px-4 py-3.5 text-sm font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 disabled:bg-background/20 disabled:text-muted-fg disabled:border-white/5 transition-all" 
                    />
                  </div>

                  {isEditing && (
                    <div className="group animate-in fade-in slide-in-from-top-2 duration-300">
                      <label className="text-[11px] font-black text-muted-fg uppercase tracking-widest block mb-2 group-focus-within:text-primary transition-colors">Avatar URL (Optional)</label>
                      <input 
                        type="text" 
                        value={avatar} 
                        onChange={e => setAvatar(e.target.value)} 
                        className="w-full bg-background/60 border border-white/10 rounded-xl px-4 py-3.5 text-sm font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all" 
                        placeholder="https://example.com/avatar.png" 
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-12 relative z-10 animate-in fade-in slide-in-from-left-4 duration-500">
              
              {/* Change Password */}
              <div className="space-y-6">
                <div className="border-b border-white/10 pb-4">
                  <h2 className="text-xl font-black uppercase tracking-widest text-foreground flex items-center gap-3">
                    <Key className="w-6 h-6 text-primary" /> Security Credentials
                  </h2>
                  <p className="text-sm text-muted-fg font-medium mt-1">Update your password to maintain account safety</p>
                </div>
                
                <form onSubmit={handleChangePassword} className="space-y-5 max-w-md">
                  <div className="group">
                    <label className="text-[10px] font-black text-muted-fg uppercase tracking-widest block mb-2">Current Password</label>
                    <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full bg-background/60 border border-white/10 rounded-xl px-4 py-3.5 text-sm font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all" required />
                  </div>
                  <div className="group">
                    <label className="text-[10px] font-black text-muted-fg uppercase tracking-widest block mb-2">New Password</label>
                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full bg-background/60 border border-white/10 rounded-xl px-4 py-3.5 text-sm font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all" required minLength={8} />
                  </div>
                  <button type="submit" disabled={loading} className="brutalist-btn px-6 py-3.5 text-sm w-full mt-2">
                    {loading ? 'Updating...' : 'Update Password'}
                  </button>
                </form>
              </div>

              {/* 2FA Section */}
              <div className="space-y-6">
                <div className="border-b border-white/10 pb-4">
                  <h2 className="text-xl font-black uppercase tracking-widest text-foreground flex items-center gap-3">
                    <ShieldAlert className="w-6 h-6 text-primary" /> Two-Factor Auth (2FA)
                  </h2>
                  <p className="text-sm text-muted-fg font-medium mt-1">Protect your workspace from unauthorized access.</p>
                </div>
                
                {user.two_factor_enabled ? (
                  <div className="bg-success/5 border border-success/20 p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 backdrop-blur-sm relative overflow-hidden">
                    <div className="absolute inset-0 bg-success/10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-success/20 to-transparent opacity-50" />
                    <div className="flex items-center gap-4 relative z-10">
                      <div className="w-12 h-12 bg-success/20 rounded-full flex items-center justify-center border border-success/30">
                        <Check className="w-6 h-6 text-success" />
                      </div>
                      <div>
                        <span className="block font-black text-success tracking-wide text-lg">2FA is Enabled</span>
                        <span className="text-xs text-success/80 font-bold uppercase tracking-wider">Your account is highly secure</span>
                      </div>
                    </div>
                    <button onClick={disable2FA} disabled={loading} className="relative z-10 px-5 py-2.5 rounded-xl border border-danger/30 text-danger font-bold text-sm hover:bg-danger hover:text-white transition-colors flex items-center gap-2 justify-center">
                      <LogOut className="w-4 h-4" /> Disable 2FA
                    </button>
                  </div>
                ) : (
                  <div>
                    {!twoFaSetup ? (
                      <div className="bg-background/40 border border-white/5 rounded-2xl p-6 max-w-md">
                        <p className="text-sm text-muted-fg mb-6 font-medium leading-relaxed">
                          We strongly recommend enabling 2FA. It requires a 6-digit code from your authenticator app every time you sign in.
                        </p>
                        <button onClick={generate2FA} disabled={loading} className="brutalist-btn px-6 py-3.5 text-sm w-full flex items-center justify-center gap-3">
                          <Smartphone className="w-5 h-5" /> Begin 2FA Setup
                        </button>
                      </div>
                    ) : (
                      <div className="bg-background/40 p-8 rounded-3xl space-y-8 border border-primary/20 max-w-md relative overflow-hidden shadow-[0_0_40px_rgba(var(--color-primary),0.1)]">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent" />
                        
                        <div className="text-center space-y-2">
                          <h3 className="text-lg font-black uppercase tracking-widest text-foreground">Scan QR Code</h3>
                          <p className="text-xs text-muted-fg font-bold">Use Google Authenticator or Authy</p>
                        </div>
                        
                        <div className="bg-white p-4 rounded-2xl mx-auto w-max shadow-xl border border-white/20">
                          <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
                        </div>
                        
                        <div className="space-y-4">
                          <label className="text-[10px] font-black text-muted-fg uppercase tracking-widest block text-center">Enter 6-Digit Verification Code</label>
                          <input 
                            type="text" 
                            placeholder="000000" 
                            value={twoFaToken} 
                            onChange={e => setTwoFaToken(e.target.value)} 
                            className="w-full text-center tracking-[1em] font-mono text-3xl bg-background/80 border border-primary/30 rounded-xl px-4 py-4 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 shadow-inner" 
                            maxLength={6} 
                          />
                        </div>
                        
                        <div className="flex gap-3 pt-2">
                          <button onClick={() => setTwoFaSetup(false)} className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-sm font-bold text-muted-fg hover:bg-white/5 transition-colors">
                            Cancel
                          </button>
                          <button onClick={enable2FA} disabled={twoFaToken.length !== 6 || loading} className="flex-1 brutalist-btn px-4 py-3 text-sm flex items-center justify-center gap-2">
                            <Shield className="w-4 h-4" /> Verify
                          </button>
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
