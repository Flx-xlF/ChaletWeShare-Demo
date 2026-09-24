
const DEMO_PROFILES = [
  { id: 1, profile_id: 'elena', name: 'Elena', avatar: 'swan', email: 'elena@chaletshare.demo', sync_token: 'demo_token_1' },
  { id: 2, profile_id: 'lucas', name: 'Lucas', avatar: 'fox', email: 'lucas@chaletshare.demo', sync_token: 'demo_token_2' },
  { id: 3, profile_id: 'sophie', name: 'Sophie', avatar: 'bear', email: 'sophie@chaletshare.demo', sync_token: 'demo_token_3' },
  { id: 4, profile_id: 'nico', name: 'Nico', avatar: 'ibex', email: 'nico@chaletshare.demo', sync_token: 'demo_token_4' }
];
/**
 * ChaletWeShare — Profile & Auth State Manager
 */
import { isStandalone } from '../utils/pwaUtils.js';

const STORAGE_KEYS = {
  UNLOCKED: 'chaletws_site_unlocked',
  GATE_TOKEN: 'chaletws_gate_token',
  ACTIVE_PROFILE: 'chaletws_active_profile',
  LAST_ACTIVE_PROFILE_ID: 'chaletws_last_active_profile_id',
  PROFILES_CACHE: 'chaletws_profiles_cache',
  LINKED_TOKENS: 'chaletws_linked_tokens',
};

export class ProfileManager {
  constructor() {
    this.apiBase = './api/users.php';
  }

  getLastActiveProfileId() {
    return localStorage.getItem(STORAGE_KEYS.LAST_ACTIVE_PROFILE_ID) || null;
  }

  setLastActiveProfileId(profileId) {
    if (profileId) {
      localStorage.setItem(STORAGE_KEYS.LAST_ACTIVE_PROFILE_ID, profileId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.LAST_ACTIVE_PROFILE_ID);
    }
  }

  getLinkedProfileIds() {
    try {
      const map = JSON.parse(localStorage.getItem(STORAGE_KEYS.LINKED_TOKENS) || '{}');
      return Object.keys(map).filter(k => !!map[k]);
    } catch (e) {
      return [];
    }
  }

  unlinkDevice(profileId) {
    this.removeStoredToken(profileId);
    if (this.getLastActiveProfileId() === profileId) {
      this.setLastActiveProfileId(null);
    }
    const active = this.getActiveProfile();
    if (active && active.profile_id === profileId) {
      this.clearActiveProfile();
    }
  }

  getGateToken() {
    return localStorage.getItem(STORAGE_KEYS.GATE_TOKEN) || null;
  }

  isGateUnlocked() {
    return true; // Always unlocked for demo showcase
  }

  getStoredToken(profileId) {
    if (!profileId) return null;
    try {
      const map = JSON.parse(localStorage.getItem(STORAGE_KEYS.LINKED_TOKENS) || '{}');
      if (map[profileId]) return map[profileId];
    } catch (e) {}
    const active = this.getActiveProfile();
    if (active && active.profile_id === profileId && active.sync_token) {
      return active.sync_token;
    }
    return null;
  }

  saveStoredToken(profileId, syncToken) {
    if (!profileId || !syncToken) return;
    try {
      const map = JSON.parse(localStorage.getItem(STORAGE_KEYS.LINKED_TOKENS) || '{}');
      map[profileId] = syncToken;
      localStorage.setItem(STORAGE_KEYS.LINKED_TOKENS, JSON.stringify(map));
    } catch (e) {}
  }

  removeStoredToken(profileId) {
    try {
      const map = JSON.parse(localStorage.getItem(STORAGE_KEYS.LINKED_TOKENS) || '{}');
      delete map[profileId];
      localStorage.setItem(STORAGE_KEYS.LINKED_TOKENS, JSON.stringify(map));
    } catch (e) {}
  }

  async hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async unlockGate(password) {
    localStorage.setItem(STORAGE_KEYS.GATE_TOKEN, 'demo_gate_token');
    localStorage.setItem(STORAGE_KEYS.UNLOCKED, 'true');
    return { success: true, offline: true };
  }

  lockGate() {
    localStorage.removeItem(STORAGE_KEYS.GATE_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.UNLOCKED);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROFILE);
  }

  getActiveProfile() {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_PROFILE);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE, JSON.stringify(DEMO_PROFILES[0]));
      return DEMO_PROFILES[0];
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return DEMO_PROFILES[0];
    }
  }

  setActiveProfile(profile) {
    if (profile && profile.profile_id) {
      this.setLastActiveProfileId(profile.profile_id);
      if (profile.sync_token) {
        this.saveStoredToken(profile.profile_id, profile.sync_token);
      }
    }
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE, JSON.stringify(profile));
  }

  clearActiveProfile() {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROFILE);
  }

  async fetchProfiles() {
    try {
      const gateToken = this.getGateToken();
      const res = await fetch(`${this.apiBase}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(gateToken ? { 'X-Gate-Token': gateToken } : {}),
        },
        body: JSON.stringify({
          action: 'list',
          gate_token: gateToken,
        }),
      });
      if (res.status === 401) {
        this.lockGate();
        location.reload();
        return [];
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.users)) {
        const enriched = data.users.map(u => {
          const token = this.getStoredToken(u.profile_id);
          return token ? { ...u, sync_token: token } : u;
        });
        localStorage.setItem(STORAGE_KEYS.PROFILES_CACHE, JSON.stringify(enriched));
        return enriched;
      }
    } catch (err) {
      console.warn('API error fetching profiles, using cached:', err);
    }
    const cached = localStorage.getItem(STORAGE_KEYS.PROFILES_CACHE);
    return cached ? JSON.parse(cached) : [];
  }

  getProfiles() {
    const cached = localStorage.getItem(STORAGE_KEYS.PROFILES_CACHE);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    localStorage.setItem(STORAGE_KEYS.PROFILES_CACHE, JSON.stringify(DEMO_PROFILES));
    return DEMO_PROFILES;
  }

  async createProfile(name, avatar, email = '') {
    const currentProfiles = await this.fetchProfiles();
    if (currentProfiles.length >= 12) {
      return { success: false, error: 'Maximal 12 Profile erlaubt.' };
    }

    try {
      const gateToken = this.getGateToken();
      const res = await fetch(`${this.apiBase}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(gateToken ? { 'X-Gate-Token': gateToken } : {}),
        },
        body: JSON.stringify({
          action: 'register',
          name: name.trim(),
          avatar,
          email: email.trim(),
          gate_token: gateToken,
        }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        this.saveStoredToken(data.user.profile_id, data.user.sync_token);
        this.setActiveProfile(data.user);
        return { success: true, user: data.user };
      }
      return { success: false, error: data.error || 'Fehler beim Erstellen.', isTechnical: !data.error };
    } catch (err) {
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  async linkDevice(profileId, syncCode) {
    try {
      const gateToken = this.getGateToken();
      const res = await fetch(`${this.apiBase}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(gateToken ? { 'X-Gate-Token': gateToken } : {}),
        },
        body: JSON.stringify({
          action: 'link_device',
          profile_id: profileId,
          sync_code: syncCode.trim(),
          gate_token: gateToken,
        }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        this.saveStoredToken(data.user.profile_id, data.user.sync_token);
        this.setActiveProfile(data.user);
        const cached = this.getProfiles();
        const idx = cached.findIndex(p => p.profile_id === profileId);
        if (idx !== -1) {
          cached[idx] = { ...cached[idx], sync_token: data.user.sync_token };
          localStorage.setItem(STORAGE_KEYS.PROFILES_CACHE, JSON.stringify(cached));
        }
        return { success: true, user: data.user };
      }
      return { success: false, error: data.error || 'Ungültiger Koppel-Code.', isTechnical: false };
    } catch (err) {
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  async resetSyncToken(profileId, syncToken = '', newToken = null) {
    try {
      const gateToken = this.getGateToken();
      const payload = {
        action: 'reset_token',
        profile_id: profileId,
        sync_token: syncToken || '',
        gate_token: gateToken,
      };
      if (newToken) {
        payload.new_token = newToken;
      }
      const res = await fetch(`${this.apiBase}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(gateToken ? { 'X-Gate-Token': gateToken } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success && data.sync_token) {
        this.saveStoredToken(profileId, data.sync_token);
        const active = this.getActiveProfile();
        if (active && active.profile_id === profileId) {
          const updated = { ...active, sync_token: data.sync_token };
          this.setActiveProfile(updated);
        }
        const cached = this.getProfiles();
        const idx = cached.findIndex(p => p.profile_id === profileId);
        if (idx !== -1) {
          cached[idx] = { ...cached[idx], sync_token: data.sync_token };
          localStorage.setItem(STORAGE_KEYS.PROFILES_CACHE, JSON.stringify(cached));
        }
        return { success: true, sync_token: data.sync_token, sync_code: data.sync_code };
      }
      return { success: false, error: data.error || 'Fehler beim Zurücksetzen.', isTechnical: !data.error };
    } catch (err) {
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  async updateProfile(profileId, syncToken, { name, avatar, email }) {
    try {
      const res = await fetch(`${this.apiBase}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          profile_id: profileId,
          sync_token: syncToken,
          name,
          avatar,
          email,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const active = this.getActiveProfile();
        if (active && active.profile_id === profileId) {
          this.setActiveProfile({ ...active, name, avatar, email });
        }
        return { success: true };
      }
      return { success: false, error: data.error || 'Fehler beim Aktualisieren.', isTechnical: !data.error };
    } catch (err) {
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  async deleteProfile(profileId, syncToken) {
    this.removeStoredToken(profileId);
    if (this.getLastActiveProfileId() === profileId) {
      this.setLastActiveProfileId(null);
    }
    try {
      const res = await fetch(`${this.apiBase}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          profile_id: profileId,
          sync_token: syncToken,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const active = this.getActiveProfile();
        if (active && active.profile_id === profileId) {
          this.clearActiveProfile();
        }
        return { success: true };
      }
      return { success: false, error: data.error || 'Fehler beim Löschen.', isTechnical: !data.error };
    } catch (err) {
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }
}

export const profileManager = new ProfileManager();
