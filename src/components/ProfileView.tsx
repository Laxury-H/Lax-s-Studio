import React, { useState } from 'react';
import {
  BadgeCheck,
  Camera,
  Check,
  Fingerprint,
  Key,
  Link as LinkIcon,
  LockKeyhole,
  Mail,
  Save,
  Shield,
  ShieldAlert,
  Smartphone,
  User,
  X
} from 'lucide-react';

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
  const twoFaEnabled = Boolean(user?.two_factor_enabled);
  const emailVerified = user?.email_verified !== 0;
  const displayName = name || user?.name || user?.email?.split('@')[0] || 'Workspace User';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join('') || 'LS';
  const accountId = user?.id ? user.id.slice(0, 8).toUpperCase() : 'LOCAL';

  const handleCancelEdit = () => {
    setName(user?.name || '');
    setAvatar(user?.avatar_url || '');
    setIsEditing(false);
  };

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
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-5 lg:px-8 py-4 sm:py-6 animate-in fade-in zoom-in duration-500">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-2xl shadow-black/5 dark:shadow-black/30">
        <div className="absolute inset-0 pointer-events-none opacity-[0.04] dark:opacity-[0.08] bg-[linear-gradient(90deg,var(--foreground)_1px,transparent_1px),linear-gradient(0deg,var(--foreground)_1px,transparent_1px)] bg-[size:28px_28px]" />
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-success to-primary" />

        <div className="relative p-5 sm:p-7 lg:p-8 border-b border-border">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="relative shrink-0">
                <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-3xl border border-primary/30 bg-muted flex items-center justify-center overflow-hidden shadow-xl shadow-primary/10">
                  {avatar ? (
                    <img src={avatar} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-3xl font-black text-primary">{initials}</span>
                  )}
                </div>
                <div className="absolute -right-2 -bottom-2 h-9 w-9 rounded-2xl border border-border bg-background flex items-center justify-center shadow-lg">
                  <BadgeCheck className="h-5 w-5 text-success" />
                </div>
              </div>

              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
                    Secure Workspace
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                    twoFaEnabled
                      ? 'border-success/30 bg-success/10 text-success'
                      : 'border-warning/30 bg-warning/10 text-warning'
                  }`}>
                    {twoFaEnabled ? '2FA Enabled' : '2FA Ready'}
                  </span>
                </div>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black italic tracking-normal text-foreground leading-none">
                  {displayName}
                </h1>
                <div className="mt-3 flex flex-col gap-2 text-xs font-bold text-muted-fg sm:flex-row sm:items-center sm:gap-4">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate">{user.email}</span>
                  </span>
                  <span className="inline-flex items-center gap-2 font-mono uppercase tracking-wider">
                    <Fingerprint className="h-4 w-4 text-primary" />
                    ID {accountId}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:min-w-[34rem]">
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <span className="block text-[10px] font-black uppercase tracking-widest text-muted-fg">Email</span>
                <span className={`mt-2 inline-flex items-center gap-1.5 text-sm font-black ${emailVerified ? 'text-success' : 'text-warning'}`}>
                  <Check className="h-4 w-4" />
                  {emailVerified ? 'Verified' : 'Pending'}
                </span>
              </div>
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <span className="block text-[10px] font-black uppercase tracking-widest text-muted-fg">Access</span>
                <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-black text-foreground">
                  <LockKeyhole className="h-4 w-4 text-primary" />
                  Owner
                </span>
              </div>
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <span className="block text-[10px] font-black uppercase tracking-widest text-muted-fg">Session</span>
                <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-black text-primary">
                  Live
                  <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_12px_var(--success)]" />
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative p-4 sm:p-6 lg:p-8">
          {message.text && (
            <div className={`mb-6 p-4 rounded-2xl border shadow-lg flex items-center gap-3 font-bold text-sm animate-in slide-in-from-top-4 ${message.type === 'error' ? 'bg-danger/10 text-danger border-danger/20' : 'bg-success/10 text-success border-success/20'}`}>
              {message.type === 'error' ? <ShieldAlert className="w-5 h-5 shrink-0" /> : <Check className="w-5 h-5 shrink-0" />}
              <span>{message.text}</span>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="space-y-3">
              <button
                onClick={() => setActiveTab('general')}
                className={`w-full min-h-20 rounded-2xl border px-5 py-4 text-left transition-all duration-200 ${
                  activeTab === 'general'
                    ? 'border-primary/60 bg-primary/10 shadow-lg shadow-primary/10'
                    : 'border-border bg-background/50 hover:border-primary/30 hover:bg-muted/40'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl border ${activeTab === 'general' ? 'border-primary/40 bg-primary text-primary-fg' : 'border-border bg-card text-muted-fg'}`}>
                    <User className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-black ${activeTab === 'general' ? 'text-primary' : 'text-foreground'}`}>General Info</span>
                    <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-widest text-muted-fg">Identity profile</span>
                  </span>
                </span>
              </button>

              <button
                onClick={() => setActiveTab('security')}
                className={`w-full min-h-20 rounded-2xl border px-5 py-4 text-left transition-all duration-200 ${
                  activeTab === 'security'
                    ? 'border-primary/60 bg-primary/10 shadow-lg shadow-primary/10'
                    : 'border-border bg-background/50 hover:border-primary/30 hover:bg-muted/40'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl border ${activeTab === 'security' ? 'border-primary/40 bg-primary text-primary-fg' : 'border-border bg-card text-muted-fg'}`}>
                    <Shield className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-black ${activeTab === 'security' ? 'text-primary' : 'text-foreground'}`}>Security & 2FA</span>
                    <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-widest text-muted-fg">Credentials</span>
                  </span>
                </span>
              </button>

              <div className="rounded-2xl border border-border bg-background/50 p-5">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-fg">Profile Health</span>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 text-xs font-bold">
                    <span className="text-muted-fg">Email verified</span>
                    <span className={emailVerified ? 'text-success' : 'text-warning'}>{emailVerified ? 'Active' : 'Pending'}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${twoFaEnabled ? 'w-full bg-success' : 'w-2/3 bg-primary'}`} />
                  </div>
                  <p className="text-xs leading-relaxed text-muted-fg">
                    {twoFaEnabled
                      ? 'Your login has an additional authenticator layer.'
                      : 'Enable 2FA to complete your workspace hardening.'}
                  </p>
                </div>
              </div>
            </aside>

            <section className="min-w-0">
              {activeTab === 'general' ? (
                <form onSubmit={handleUpdateProfile} className="rounded-3xl border border-border bg-background/50 p-5 sm:p-6 lg:p-8 shadow-xl shadow-black/5 dark:shadow-black/20 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Personal Information</span>
                      <h2 className="mt-2 text-2xl font-black uppercase tracking-normal text-foreground">Workspace Identity</h2>
                      <p className="mt-1 text-sm font-medium text-muted-fg">Manage the name and visual identity shown across Lax's Studio.</p>
                    </div>
                    {!isEditing ? (
                      <button type="button" onClick={() => setIsEditing(true)} className="brutalist-btn h-11 px-5 text-sm flex items-center justify-center gap-2 whitespace-nowrap">
                        <User className="w-4 h-4" /> Edit Profile
                      </button>
                    ) : (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button type="button" onClick={handleCancelEdit} className="h-11 px-5 rounded-xl text-muted-fg font-bold hover:bg-muted transition-colors border border-border flex items-center justify-center gap-2">
                          <X className="w-4 h-4" /> Cancel
                        </button>
                        <button type="submit" disabled={loading} className="brutalist-btn h-11 px-5 text-sm flex items-center justify-center gap-2">
                          {loading ? <div className="w-4 h-4 border-2 border-primary-fg/30 border-t-primary-fg rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                          Save Changes
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-8 pt-6 xl:grid-cols-[15rem_minmax(0,1fr)]">
                    <div className="space-y-4">
                      <div className="relative group mx-auto h-44 w-44 overflow-hidden rounded-3xl border border-border bg-card flex items-center justify-center shadow-inner sm:mx-0">
                        {avatar ? (
                          <img src={avatar} alt="Avatar" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        ) : (
                          <span className="text-5xl font-black text-primary">{initials}</span>
                        )}
                        {isEditing && (
                          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 text-primary">
                            <Camera className="w-8 h-8 mb-2" />
                            <span className="text-[10px] font-black uppercase tracking-wider">Avatar URL</span>
                          </div>
                        )}
                      </div>
                      <div className="rounded-2xl border border-border bg-card p-4">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-muted-fg">Public Label</span>
                        <span className="mt-2 block truncate text-lg font-black text-foreground">{displayName}</span>
                        <span className="mt-1 block truncate text-xs font-semibold text-muted-fg">{user.email}</span>
                      </div>
                    </div>

                    <div className="grid gap-5">
                      <div>
                        <label className="text-[11px] font-black text-muted-fg uppercase tracking-widest block mb-2">Email Address</label>
                        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-3">
                            <Mail className="h-4 w-4 shrink-0 text-primary" />
                            <span className="truncate text-sm font-semibold text-muted-fg">{user.email}</span>
                          </div>
                          <span className={`inline-flex w-max items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${emailVerified ? 'border-success/20 bg-success/10 text-success' : 'border-warning/20 bg-warning/10 text-warning'}`}>
                            <Check className="w-3 h-3" /> {emailVerified ? 'Verified' : 'Pending'}
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-black text-muted-fg uppercase tracking-widest block mb-2">Display Name</label>
                        <input
                          type="text"
                          value={name}
                          onChange={e => setName(e.target.value)}
                          disabled={!isEditing}
                          className="w-full bg-card border border-border rounded-2xl px-4 py-3.5 text-sm font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:text-muted-fg disabled:cursor-not-allowed transition-all"
                        />
                      </div>

                      <div className={`transition-all ${isEditing ? 'opacity-100' : 'opacity-75'}`}>
                        <label className="text-[11px] font-black text-muted-fg uppercase tracking-widest block mb-2">Avatar URL</label>
                        <div className="relative">
                          <LinkIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-fg" />
                          <input
                            type="text"
                            value={avatar}
                            onChange={e => setAvatar(e.target.value)}
                            disabled={!isEditing}
                            className="w-full bg-card border border-border rounded-2xl py-3.5 pl-11 pr-4 text-sm font-medium text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:text-muted-fg disabled:cursor-not-allowed transition-all"
                            placeholder="https://example.com/avatar.png"
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-border bg-card p-4">
                          <span className="block text-[10px] font-black uppercase tracking-widest text-muted-fg">Account Role</span>
                          <span className="mt-2 block text-sm font-black text-foreground">Workspace Owner</span>
                        </div>
                        <div className="rounded-2xl border border-border bg-card p-4">
                          <span className="block text-[10px] font-black uppercase tracking-widest text-muted-fg">Security Layer</span>
                          <span className={`mt-2 block text-sm font-black ${twoFaEnabled ? 'text-success' : 'text-primary'}`}>{twoFaEnabled ? 'Authenticator active' : 'Authenticator available'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
                  <div className={`rounded-3xl border p-5 sm:p-6 ${twoFaEnabled ? 'border-success/20 bg-success/10' : 'border-primary/20 bg-primary/10'}`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border ${twoFaEnabled ? 'border-success/30 bg-success/20 text-success' : 'border-primary/30 bg-primary/20 text-primary'}`}>
                          {twoFaEnabled ? <Shield className="h-7 w-7" /> : <ShieldAlert className="h-7 w-7" />}
                        </div>
                        <div>
                          <span className={`block text-lg font-black ${twoFaEnabled ? 'text-success' : 'text-primary'}`}>
                            {twoFaEnabled ? 'Two-factor authentication is active' : 'Two-factor authentication is not active'}
                          </span>
                          <span className="mt-1 block text-sm font-medium text-muted-fg">
                            {twoFaEnabled ? 'Your account requires an authenticator token at sign-in.' : 'Add an authenticator token to harden this workspace.'}
                          </span>
                        </div>
                      </div>
                      {twoFaEnabled && (
                        <button onClick={disable2FA} disabled={loading} className="h-11 px-5 rounded-xl border border-danger/30 text-danger font-bold text-sm hover:bg-danger hover:text-white transition-colors flex items-center justify-center gap-2">
                          <X className="w-4 h-4" /> Disable 2FA
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <form onSubmit={handleChangePassword} className="rounded-3xl border border-border bg-background/50 p-5 sm:p-6 shadow-xl shadow-black/5 dark:shadow-black/20">
                      <div className="border-b border-border pb-5">
                        <h2 className="text-xl font-black uppercase tracking-normal text-foreground flex items-center gap-3">
                          <Key className="w-5 h-5 text-primary" /> Password
                        </h2>
                        <p className="text-sm text-muted-fg font-medium mt-1">Refresh your credentials with a stronger password.</p>
                      </div>

                      <div className="space-y-5 pt-5">
                        <div>
                          <label className="text-[10px] font-black text-muted-fg uppercase tracking-widest block mb-2">Current Password</label>
                          <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full bg-card border border-border rounded-2xl px-4 py-3.5 text-sm font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all" required />
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-muted-fg uppercase tracking-widest block mb-2">New Password</label>
                          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full bg-card border border-border rounded-2xl px-4 py-3.5 text-sm font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all" required minLength={8} />
                        </div>
                        <button type="submit" disabled={loading} className="brutalist-btn h-12 px-6 text-sm w-full mt-2 flex items-center justify-center gap-2">
                          {loading ? 'Updating...' : 'Update Password'}
                        </button>
                      </div>
                    </form>

                    <div className="rounded-3xl border border-border bg-background/50 p-5 sm:p-6 shadow-xl shadow-black/5 dark:shadow-black/20">
                      <div className="border-b border-border pb-5">
                        <h2 className="text-xl font-black uppercase tracking-normal text-foreground flex items-center gap-3">
                          <Smartphone className="w-5 h-5 text-primary" /> Authenticator
                        </h2>
                        <p className="text-sm text-muted-fg font-medium mt-1">Use Google Authenticator, Authy, or another OTP app.</p>
                      </div>

                      {twoFaEnabled ? (
                        <div className="pt-5">
                          <div className="rounded-2xl border border-success/20 bg-success/10 p-5">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-xl border border-success/30 bg-success/20 flex items-center justify-center">
                                <Check className="w-5 h-5 text-success" />
                              </div>
                              <div>
                                <span className="block font-black text-success">Authenticator enabled</span>
                                <span className="text-xs text-muted-fg font-medium">This account is protected at sign-in.</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : !twoFaSetup ? (
                        <div className="pt-5">
                          <p className="text-sm text-muted-fg mb-6 font-medium leading-relaxed">
                            Generate a QR code, scan it with your authenticator app, then enter the 6-digit code to activate 2FA.
                          </p>
                          <button onClick={generate2FA} disabled={loading} className="brutalist-btn h-12 px-6 text-sm w-full flex items-center justify-center gap-3">
                            <Smartphone className="w-5 h-5" /> Begin 2FA Setup
                          </button>
                        </div>
                      ) : (
                        <div className="pt-5 space-y-6">
                          <div className="text-center space-y-1">
                            <h3 className="text-base font-black uppercase tracking-widest text-foreground">Scan QR Code</h3>
                            <p className="text-xs text-muted-fg font-bold">Use Google Authenticator or Authy</p>
                          </div>

                          <div className="bg-white p-4 rounded-2xl mx-auto w-max shadow-xl border border-border">
                            <img src={qrCode} alt="2FA QR Code" className="w-44 h-44 sm:w-48 sm:h-48" />
                          </div>

                          <div className="space-y-3">
                            <label className="text-[10px] font-black text-muted-fg uppercase tracking-widest block text-center">6-Digit Verification Code</label>
                            <input
                              type="text"
                              placeholder="000000"
                              value={twoFaToken}
                              onChange={e => setTwoFaToken(e.target.value)}
                              className="w-full text-center tracking-[0.45em] font-mono text-2xl bg-card border border-primary/30 rounded-2xl px-4 py-4 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-inner"
                              maxLength={6}
                            />
                          </div>

                          <div className="flex flex-col gap-3 sm:flex-row">
                            <button type="button" onClick={() => setTwoFaSetup(false)} className="flex-1 h-11 px-4 rounded-xl border border-border text-sm font-bold text-muted-fg hover:bg-muted transition-colors flex items-center justify-center gap-2">
                              <X className="w-4 h-4" /> Cancel
                            </button>
                            <button onClick={enable2FA} disabled={twoFaToken.length !== 6 || loading} className="flex-1 h-11 brutalist-btn px-4 text-sm flex items-center justify-center gap-2">
                              <Shield className="w-4 h-4" /> Verify
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
