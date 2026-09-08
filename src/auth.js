// ==============================================================================
// SkillGYM - Supabase Authentication & User Account Management
// ==============================================================================
// Provides real authentication with Supabase for user signup, login, session
// persistence, account creation, and syncing player state across all pages.
// ==============================================================================

import { supabase, isSupabaseConfigured } from './supabase.js';
import { gameState, saveState } from './data.js';
import { sounds } from './audio.js';

let currentUser = null;
let currentSession = null;
const authListeners = new Set();

/**
 * Register a new user with email, password, and username in Supabase.
 * 
 * @param {object} credentials { email, password, username }
 * @returns {Promise<{ success: boolean, user?: object, message?: string, error?: string }>}
 */
export async function signUpUser({ email, password, username }) {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error: 'Supabase credentials not configured in .env'
    };
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanUsername = (username || '').trim() || cleanEmail.split('@')[0];

  try {
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: password,
      options: {
        data: {
          username: cleanUsername,
          displayName: cleanUsername,
          avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(cleanUsername)
        }
      }
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data?.user) {
      currentUser = data.user;
      currentSession = data.session;
      syncPlayerWithUser(data.user);

      const requiresConfirmation = !data.session && data.user.identities && data.user.identities.length > 0;
      return {
        success: true,
        user: data.user,
        message: requiresConfirmation
          ? 'Account created! Please check your email inbox to verify your account.'
          : `Welcome to SkillGYM, ${cleanUsername}! Account created successfully.`
      };
    }

    return { success: false, error: 'Registration failed. Please try again.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Sign in existing user with email and password.
 * 
 * @param {object} credentials { email, password }
 * @returns {Promise<{ success: boolean, user?: object, error?: string }>}
 */
export async function signInUser({ email, password }) {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error: 'Supabase credentials not configured in .env'
    };
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: password
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data?.user) {
      currentUser = data.user;
      currentSession = data.session;
      syncPlayerWithUser(data.user);
      return {
        success: true,
        user: data.user,
        message: `Welcome back, ${gameState.player.name}!`
      };
    }

    return { success: false, error: 'Sign in failed. Check your email & password.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Sign out user from Supabase.
 */
export async function signOutUser() {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('Sign out warning:', err);
  } finally {
    currentUser = null;
    currentSession = null;
    gameState.player.name = 'NeoCoder_42';
    delete gameState.player.email;
    delete gameState.player.userId;
    saveState();
    notifyAuthChange(null);
  }
}

/**
 * Check current logged in user from Supabase session.
 */
export async function checkInitialAuth() {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      currentUser = session.user;
      currentSession = session;
      syncPlayerWithUser(session.user);
      notifyAuthChange(session.user);
      return session.user;
    }
  } catch (err) {
    console.warn('[Auth Check Error]', err);
  }
  return null;
}

/**
 * Get cached current user.
 */
export function getCurrentAuthUser() {
  return currentUser;
}

/**
 * Register listener for auth state changes.
 */
export function onAuthStateChanged(callback) {
  authListeners.add(callback);
  return () => authListeners.delete(callback);
}

function notifyAuthChange(user) {
  authListeners.forEach(cb => {
    try { cb(user); } catch (e) { console.error(e); }
  });
}

function syncPlayerWithUser(user) {
  if (!user) return;
  const username = user.user_metadata?.username || user.user_metadata?.displayName || user.email.split('@')[0];
  gameState.player.name = username;
  gameState.player.email = user.email;
  gameState.player.userId = user.id;
  saveState();
  notifyAuthChange(user);
}

// Listen to Supabase background auth state changes (token refresh, signout, etc.)
if (isSupabaseConfigured()) {
  supabase.auth.onAuthStateChange((event, session) => {
    currentSession = session;
    currentUser = session?.user || null;
    if (session?.user) {
      syncPlayerWithUser(session.user);
    } else {
      notifyAuthChange(null);
    }
  });
}

/**
 * Initializes the Auth HUD Widget and Modal across pages.
 */
export function initAuthUI() {
  // 1. Initial check
  checkInitialAuth().then(user => {
    updateAuthHUD(user);
  });

  // 2. Subscribe to auth changes
  onAuthStateChanged(user => {
    updateAuthHUD(user);
  });

  // 3. Inject Auth Modal into DOM if not present
  injectAuthModalDOM();
}

/**
 * Updates the HUD display badge based on user login state.
 */
function updateAuthHUD(user) {
  const container = document.getElementById('auth-hud-widget');
  if (!container) return;

  if (user) {
    const name = user.user_metadata?.username || user.email.split('@')[0];
    container.innerHTML = `
      <div class="auth-user-badge" id="btn-open-profile" title="Signed in as ${user.email}. Click for profile.">
        <span class="auth-dot-online"></span>
        <span class="auth-user-icon">👤</span>
        <span class="auth-user-name">${escapeHtml(name)}</span>
      </div>
    `;
    const btn = document.getElementById('btn-open-profile');
    if (btn) btn.addEventListener('click', () => openProfileModal(user));
  } else {
    container.innerHTML = `
      <button class="auth-signin-pill-btn" id="btn-open-auth" title="Sign In or Register with Supabase">
        <span class="auth-icon-bolt">⚡</span>
        <span>SIGN IN</span>
      </button>
    `;
    const btn = document.getElementById('btn-open-auth');
    if (btn) btn.addEventListener('click', () => openAuthModal('signin'));
  }
}

/**
 * Creates and injects the Cyberpunk Auth Modal into the page.
 */
function injectAuthModalDOM() {
  if (document.getElementById('supabase-auth-modal-overlay')) return;

  const modalHtml = `
  <div id="supabase-auth-modal-overlay" class="modal-overlay">
    <div class="modal-dialog auth-dialog" role="dialog" aria-modal="true">
      
      <!-- Modal Header -->
      <div class="modal-header">
        <div class="modal-title-group">
          <span class="modal-badge-tag">SUPABASE SECURE ACCESS</span>
          <h3 class="modal-main-title" id="auth-modal-main-title">ARENA AUTHORIZATION</h3>
        </div>
        <button class="modal-close-btn" id="btn-close-auth-modal" title="Close">✕</button>
      </div>

      <!-- Auth Body -->
      <div class="modal-body auth-modal-body">
        
        <!-- Auth Tabs -->
        <div class="auth-tabs-row" id="auth-tabs-row">
          <button class="auth-tab-btn active" id="tab-btn-signin" data-tab="signin">
            <span>🔑 SIGN IN</span>
          </button>
          <button class="auth-tab-btn" id="tab-btn-signup" data-tab="signup">
            <span>🛡️ CREATE ACCOUNT</span>
          </button>
        </div>

        <!-- Alert Banner -->
        <div class="auth-alert-banner" id="auth-alert-banner" style="display: none;"></div>

        <!-- TAB 1: SIGN IN FORM -->
        <form class="auth-form-panel active" id="form-signin" autocomplete="on">
          <div class="auth-field-group">
            <label for="signin-email" class="auth-field-label">PILOT EMAIL</label>
            <input 
              type="email" 
              id="signin-email" 
              class="auth-input-control" 
              placeholder="cadet@skillgym.io" 
              required 
              autocomplete="email"
            >
          </div>

          <div class="auth-field-group">
            <label for="signin-password" class="auth-field-label">SECURITY PASSCODE</label>
            <input 
              type="password" 
              id="signin-password" 
              class="auth-input-control" 
              placeholder="••••••••" 
              required 
              autocomplete="current-password"
            >
          </div>

          <div class="auth-actions-row">
            <button type="submit" class="auth-submit-btn" id="btn-submit-signin">
              <span>⚡ AUTHORIZE &amp; ENTER ARENA</span>
            </button>
          </div>
        </form>

        <!-- TAB 2: CREATE ACCOUNT FORM -->
        <form class="auth-form-panel" id="form-signup" autocomplete="on" style="display: none;">
          <div class="auth-field-group">
            <label for="signup-username" class="auth-field-label">CALLSIGN / USERNAME</label>
            <input 
              type="text" 
              id="signup-username" 
              class="auth-input-control" 
              placeholder="e.g. CyberNinja_01" 
              required 
              autocomplete="username"
            >
          </div>

          <div class="auth-field-group">
            <label for="signup-email" class="auth-field-label">COMMUNICATION EMAIL</label>
            <input 
              type="email" 
              id="signup-email" 
              class="auth-input-control" 
              placeholder="newhero@skillgym.io" 
              required 
              autocomplete="email"
            >
          </div>

          <div class="auth-field-group">
            <label for="signup-password" class="auth-field-label">SECURITY PASSCODE (MIN 6 CHARACTERS)</label>
            <input 
              type="password" 
              id="signup-password" 
              class="auth-input-control" 
              placeholder="••••••••" 
              required 
              minlength="6"
              autocomplete="new-password"
            >
          </div>

          <div class="auth-actions-row">
            <button type="submit" class="auth-submit-btn btn-create-acc" id="btn-submit-signup">
              <span>🛡️ CREATE SUPABASE ACCOUNT</span>
            </button>
          </div>
        </form>

        <!-- LOGGED-IN PROFILE VIEW -->
        <div class="auth-profile-panel" id="panel-profile" style="display: none;">
          <div class="profile-card-header">
            <div class="profile-avatar-box">👤</div>
            <div class="profile-meta-info">
              <h4 class="profile-name" id="profile-display-name">NeoCoder</h4>
              <span class="profile-email" id="profile-display-email">user@supabase.co</span>
              <span class="profile-status-tag">🟢 SUPABASE CLOUD AUTHENTICATED</span>
            </div>
          </div>

          <div class="profile-details-grid">
            <div class="profile-stat-box">
              <span class="stat-lbl">ALLIANCE CLAN</span>
              <strong class="stat-val" id="profile-clan-val">BitKnights</strong>
            </div>
            <div class="profile-stat-box">
              <span class="stat-lbl">CODE POINTS</span>
              <strong class="stat-val" id="profile-cp-val">6,000 CP</strong>
            </div>
            <div class="profile-stat-box">
              <span class="stat-lbl">SYNTAX LEVEL</span>
              <strong class="stat-val" id="profile-lvl-val">Level 8</strong>
            </div>
            <div class="profile-stat-box">
              <span class="stat-lbl">SESSION TOKEN</span>
              <strong class="stat-val">ACTIVE (JWT)</strong>
            </div>
          </div>

          <div class="auth-actions-row">
            <button type="button" class="auth-signout-btn" id="btn-signout-user">
              <span>🚪 SIGN OUT OF ACCOUNT</span>
            </button>
          </div>
        </div>

      </div>

    </div>
  </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  attachAuthModalEvents();
}

/**
 * Attach listeners to the auth modal DOM elements.
 */
function attachAuthModalEvents() {
  const overlay = document.getElementById('supabase-auth-modal-overlay');
  const btnClose = document.getElementById('btn-close-auth-modal');
  const tabSignIn = document.getElementById('tab-btn-signin');
  const tabSignUp = document.getElementById('tab-btn-signup');
  const formSignIn = document.getElementById('form-signin');
  const formSignUp = document.getElementById('form-signup');
  const panelProfile = document.getElementById('panel-profile');
  const btnSignOut = document.getElementById('btn-signout-user');

  if (btnClose) {
    btnClose.addEventListener('click', closeAuthModal);
  }

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeAuthModal();
    });
  }

  if (tabSignIn && tabSignUp) {
    tabSignIn.addEventListener('click', () => {
      sounds.playClick();
      switchAuthTab('signin');
    });
    tabSignUp.addEventListener('click', () => {
      sounds.playClick();
      switchAuthTab('signup');
    });
  }

  // Sign In Form Submission
  if (formSignIn) {
    formSignIn.addEventListener('submit', async (e) => {
      e.preventDefault();
      sounds.playClick();
      const email = document.getElementById('signin-email').value;
      const password = document.getElementById('signin-password').value;
      const btn = document.getElementById('btn-submit-signin');

      setAlert('', 'none');
      btn.disabled = true;
      btn.innerHTML = '<span>TRANSMITTING AUTH CREDENTIALS...</span>';

      const res = await signInUser({ email, password });
      btn.disabled = false;
      btn.innerHTML = '<span>⚡ AUTHORIZE &amp; ENTER ARENA</span>';

      if (res.success) {
        sounds.playReward();
        setAlert(res.message, 'success');
        setTimeout(() => {
          closeAuthModal();
        }, 1200);
      } else {
        sounds.playClick();
        setAlert(res.error || 'Authentication failed', 'error');
      }
    });
  }

  // Sign Up Form Submission
  if (formSignUp) {
    formSignUp.addEventListener('submit', async (e) => {
      e.preventDefault();
      sounds.playClick();
      const username = document.getElementById('signup-username').value;
      const email = document.getElementById('signup-email').value;
      const password = document.getElementById('signup-password').value;
      const btn = document.getElementById('btn-submit-signup');

      setAlert('', 'none');
      btn.disabled = true;
      btn.innerHTML = '<span>CREATING SUPABASE ACCOUNT...</span>';

      const res = await signUpUser({ email, password, username });
      btn.disabled = false;
      btn.innerHTML = '<span>🛡️ CREATE SUPABASE ACCOUNT</span>';

      if (res.success) {
        sounds.playReward();
        setAlert(res.message, 'success');
        setTimeout(() => {
          closeAuthModal();
        }, 2000);
      } else {
        sounds.playClick();
        setAlert(res.error || 'Account creation failed', 'error');
      }
    });
  }

  // Sign Out
  if (btnSignOut) {
    btnSignOut.addEventListener('click', async () => {
      sounds.playClick();
      await signOutUser();
      closeAuthModal();
    });
  }
}

export function openAuthModal(tab = 'signin') {
  sounds.playModalOpen();
  const overlay = document.getElementById('supabase-auth-modal-overlay');
  if (!overlay) return;

  const user = getCurrentAuthUser();
  if (user) {
    openProfileModal(user);
    return;
  }

  switchAuthTab(tab);
  setAlert('', 'none');
  overlay.classList.add('active');
}

function openProfileModal(user) {
  sounds.playModalOpen();
  const overlay = document.getElementById('supabase-auth-modal-overlay');
  if (!overlay) return;

  const tabsRow = document.getElementById('auth-tabs-row');
  const formSignIn = document.getElementById('form-signin');
  const formSignUp = document.getElementById('form-signup');
  const panelProfile = document.getElementById('panel-profile');
  const titleEl = document.getElementById('auth-modal-main-title');

  if (tabsRow) tabsRow.style.display = 'none';
  if (formSignIn) formSignIn.style.display = 'none';
  if (formSignUp) formSignUp.style.display = 'none';
  if (panelProfile) panelProfile.style.display = 'block';

  if (titleEl) titleEl.textContent = 'PLAYER PROFILE';

  const nameEl = document.getElementById('profile-display-name');
  const emailEl = document.getElementById('profile-display-email');
  const clanEl = document.getElementById('profile-clan-val');
  const cpEl = document.getElementById('profile-cp-val');
  const lvlEl = document.getElementById('profile-lvl-val');

  const username = user.user_metadata?.username || user.email.split('@')[0];
  if (nameEl) nameEl.textContent = username;
  if (emailEl) emailEl.textContent = user.email;
  if (clanEl) clanEl.textContent = gameState.player.clan || 'BitKnights';
  if (cpEl) cpEl.textContent = `${(gameState.player.codePoints || 6000).toLocaleString()} CP`;
  if (lvlEl) lvlEl.textContent = `Level ${gameState.player.level || 8}`;

  setAlert('', 'none');
  overlay.classList.add('active');
}

function switchAuthTab(tab) {
  const tabsRow = document.getElementById('auth-tabs-row');
  const formSignIn = document.getElementById('form-signin');
  const formSignUp = document.getElementById('form-signup');
  const panelProfile = document.getElementById('panel-profile');
  const tabSignIn = document.getElementById('tab-btn-signin');
  const tabSignUp = document.getElementById('tab-btn-signup');
  const titleEl = document.getElementById('auth-modal-main-title');

  if (tabsRow) tabsRow.style.display = 'flex';
  if (panelProfile) panelProfile.style.display = 'none';

  if (tab === 'signup') {
    if (tabSignIn) tabSignIn.classList.remove('active');
    if (tabSignUp) tabSignUp.classList.add('active');
    if (formSignIn) formSignIn.style.display = 'none';
    if (formSignUp) formSignUp.style.display = 'block';
    if (titleEl) titleEl.textContent = 'CREATE ACCOUNT';
  } else {
    if (tabSignUp) tabSignUp.classList.remove('active');
    if (tabSignIn) tabSignIn.classList.add('active');
    if (formSignUp) formSignUp.style.display = 'none';
    if (formSignIn) formSignIn.style.display = 'block';
    if (titleEl) titleEl.textContent = 'ARENA AUTHORIZATION';
  }
}

function setAlert(msg, type = 'none') {
  const alertEl = document.getElementById('auth-alert-banner');
  if (!alertEl) return;

  if (type === 'none' || !msg) {
    alertEl.style.display = 'none';
    alertEl.textContent = '';
    alertEl.className = 'auth-alert-banner';
    return;
  }

  alertEl.style.display = 'block';
  alertEl.textContent = msg;
  alertEl.className = `auth-alert-banner alert-${type}`;
}

export function closeAuthModal() {
  sounds.playModalClose();
  const overlay = document.getElementById('supabase-auth-modal-overlay');
  if (overlay) overlay.classList.remove('active');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
