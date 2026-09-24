/**
 * Chalet Alpenrose — Handover Service
 * Handles handover notes for next guests (garbage, missing items, defects, custom notes).
 */

import { profileManager } from './profileManager.js';
import { reservationStore } from './reservationStore.js';

class HandoverService {
  /**
   * Submit a handover note from the current reservation to the next guest
   * @param {Object} params
   * @param {number|string} params.reservationId
   * @param {string} params.category - 'garbage' | 'missing' | 'broken' | 'custom'
   * @param {string} params.message
   */
  async createNote({ reservationId, category = 'custom', message }) {
    const profile = profileManager.getActiveProfile();
    if (!profile) return { success: false, error: 'Nicht autorisiert.' };

    try {
      const res = await fetch('./api/handover.php?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: profile.profile_id,
          sync_token: profile.sync_token,
          reservation_id: reservationId,
          category,
          message
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          this._saveLocalNote(data.note);
          return { success: true, note: data.note };
        }
      }
    } catch (e) {
      // Local fallback
    }

    // Local fallback store
    const localNote = {
      id: 'note-local-' + Date.now(),
      reservation_id: reservationId,
      author_user_id: profile.id || 1,
      author_name: profile.name,
      author_avatar: profile.avatar,
      category,
      message,
      created_at: new Date().toISOString()
    };

    // Find next reservation locally
    const currentRes = reservationStore.reservations.find(r => r.id == reservationId);
    if (currentRes) {
      const nextRes = reservationStore.reservations
        .filter(r => r.id != reservationId && r.dateStart >= currentRes.dateEnd && r.status !== 'cancelled')
        .sort((a, b) => a.dateStart.localeCompare(b.dateStart))[0];

      if (nextRes) {
        localNote.target_reservation_id = nextRes.id;
        localNote.target_user_name = nextRes.userName;
      }
    }

    this._saveLocalNote(localNote);
    return { success: true, note: localNote };
  }

  /**
   * Fetch notes for a given reservation (both notes left for it and notes left by it)
   * @param {number|string} reservationId
   */
  async getNotesForReservation(reservationId) {
    try {
      const res = await fetch(`./api/handover.php?action=list_for_reservation&reservation_id=${reservationId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.notes) {
          return data.notes;
        }
      }
    } catch (e) {
      // Local fallback
    }

    // Return local stored notes matching
    const all = this._getAllLocalNotes();
    return all.filter(n => n.reservation_id == reservationId || n.target_reservation_id == reservationId);
  }

  /**
   * Update an existing handover note
   * @param {Object} params
   * @param {number|string} params.noteId
   * @param {string} params.category - 'garbage' | 'missing' | 'broken' | 'custom'
   * @param {string} params.message
   */
  async updateNote({ noteId, category, message }) {
    const profile = profileManager.getActiveProfile();
    if (!profile) return { success: false, error: 'Nicht autorisiert.' };

    try {
      const res = await fetch('./api/handover.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          profile_id: profile.profile_id,
          sync_token: profile.sync_token,
          note_id: noteId,
          category,
          message
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.note) {
          this._updateLocalNote(data.note);
          return { success: true, note: data.note };
        } else if (data.error) {
          return { success: false, error: data.error };
        }
      }
    } catch (e) {
      // Local fallback
    }

    // Local fallback
    const all = this._getAllLocalNotes();
    const existingIndex = all.findIndex(n => n.id == noteId);
    if (existingIndex >= 0) {
      all[existingIndex] = {
        ...all[existingIndex],
        category,
        message
      };
      localStorage.setItem('chalet_handover_notes', JSON.stringify(all));
      return { success: true, note: all[existingIndex] };
    }
    return { success: false, error: 'Notiz nicht gefunden.' };
  }

  /**
   * Delete a handover note
   * @param {number|string} noteId
   */
  async deleteNote(noteId) {
    const profile = profileManager.getActiveProfile();
    if (!profile) return { success: false, error: 'Nicht autorisiert.' };

    try {
      const res = await fetch('./api/handover.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          profile_id: profile.profile_id,
          sync_token: profile.sync_token,
          note_id: noteId
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          this._deleteLocalNote(noteId);
          return { success: true };
        }
      }
    } catch (e) {
      // Local fallback
    }

    this._deleteLocalNote(noteId);
    return { success: true };
  }

  /**
   * Check if active user should be prompted near end of stay
   */
  async checkPrompt() {
    const profile = profileManager.getActiveProfile();
    if (!profile) return { should_prompt: false };

    try {
      const res = await fetch('./api/handover.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'check_prompt',
          profile_id: profile.profile_id,
          sync_token: profile.sync_token,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.should_prompt) return data;
      }
    } catch (e) {
      // Local fallback
    }

    // Local simulation: check active user's reservations ending today or tomorrow that have already started
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const userRes = reservationStore.reservations.find(r => 
      (r.userId == profile.id || r.userName === profile.name) &&
      (r.status === 'booked' || r.status === 'shared') &&
      r.dateStart <= today &&
      (r.dateEnd === today || r.dateEnd === tomorrow)
    );

    if (userRes) {
      const all = this._getAllLocalNotes();
      const hasNote = all.some(n => n.reservation_id == userRes.id);
      return {
        should_prompt: !hasNote,
        reservation: userRes
      };
    }

    return { should_prompt: false };
  }

  /**
   * Check if active user has an upcoming check-in (< 48h) or just checked in (< 24h)
   * and fetch arrival briefing (previous notes, calendar export)
   */
  async getArrivalBriefing() {
    const profile = profileManager.getActiveProfile();
    if (!profile) return { has_arrival: false };

    try {
      const res = await fetch('./api/handover.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_arrival_briefing',
          profile_id: profile.profile_id,
          sync_token: profile.sync_token,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.has_arrival) return data;
      }
    } catch (e) {
      // Local fallback
    }

    // Local simulation: find user's next confirmed stay
    const today = new Date().toISOString().split('T')[0];
    const userRes = reservationStore.reservations
      .filter(r => 
        (r.userId == profile.id || r.userName === profile.name) &&
        (r.status === 'booked' || r.status === 'shared') &&
        r.dateEnd >= today
      )
      .sort((a, b) => a.dateStart.localeCompare(b.dateStart))[0];

    if (userRes) {
      const startDt = new Date(userRes.dateStart + 'T15:00:00');
      const now = new Date();
      const diffHours = (startDt - now) / (1000 * 60 * 60);

      // Arrival briefing is strictly shown between 48h before check-in and 24h after check-in
      if (diffHours >= -24 && diffHours <= 48) {
        const isOngoing = now >= startDt;
        const allNotes = this._getAllLocalNotes();
        const notes = allNotes.filter(n => n.target_reservation_id == userRes.id || n.reservation_id != userRes.id);
        const diffMs = Math.max(0, startDt - now);
        const hoursUntil = Math.floor(diffMs / (1000 * 60 * 60));
        const minutesUntil = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        return {
          success: true,
          has_arrival: true,
          is_ongoing: isOngoing,
          hours_until_checkin: hoursUntil,
          minutes_until_checkin: minutesUntil,
          reservation: userRes,
          notes_from_prev: notes
        };
      }
    }

    return { has_arrival: false };
  }

  _getAllLocalNotes() {
    try {
      const raw = localStorage.getItem('chalet_handover_notes');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  _saveLocalNote(note) {
    try {
      const list = this._getAllLocalNotes();
      list.unshift(note);
      localStorage.setItem('chalet_handover_notes', JSON.stringify(list));
    } catch (e) {}
  }

  _deleteLocalNote(noteId) {
    try {
      let list = this._getAllLocalNotes();
      list = list.filter(n => n.id != noteId);
      localStorage.setItem('chalet_handover_notes', JSON.stringify(list));
    } catch (e) {}
  }

  _updateLocalNote(updatedNote) {
    try {
      let list = this._getAllLocalNotes();
      const idx = list.findIndex(n => n.id == updatedNote.id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...updatedNote };
        localStorage.setItem('chalet_handover_notes', JSON.stringify(list));
      }
    } catch (e) {}
  }
}

export const handoverService = new HandoverService();
