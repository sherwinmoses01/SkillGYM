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

// Helper to convert any Pilot ID or username to a valid Supabase auth email
export function normalizeIdentifier(identifier) {
  const trimmed = (identifier || '').trim();
  if (!trimmed) return 'pilot_guest@skillgym.io';
  if (trimmed.includes('@')) return trimmed.toLowerCase();
  const safeId = trimmed.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  return `${safeId || 'pilot'}@skillgym.io`;
}

/**
 * Register a new user with a Pilot ID / Username and password in Supabase.
 * No email confirmation required. Automatically generates active session.
 * 
 * @param {object} credentials { identifier, password, username }
 * @returns {Promise<{ success: boolean, user?: object, message?: string, error?: string }>}
 */
export async function signUpUser({ identifier, password, username }) {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error: 'Supabase credentials not configured in .env'
    };
  }

  const rawId = (identifier || username || '').trim();
  if (!rawId) {
    return { success: false, error: 'Please enter a Pilot ID / Callsign.' };
  }
  if (rawId.length < 3) {
    return { success: false, error: 'Pilot ID must be at least 3 characters long.' };
  }
  if (!password || password.length < 6) {
    return { success: false, error: 'Passcode must be at least 6 characters long.' };
  }

  const email = normalizeIdentifier(rawId);
  const cleanUsername = rawId.includes('@') ? rawId.split('@')[0] : rawId;

  try {
    // 1. Create account in Supabase
    let { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          username: cleanUsername,
          displayName: cleanUsername,
          pilotId: cleanUsername,
          avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(cleanUsername)
        }
      }
    });

    // If already registered, attempt instant sign-in directly
    if (error && (error.message.includes('already registered') || error.message.includes('User already exists'))) {
      const signInRes = await signInUser({ identifier: rawId, password });
      if (signInRes.success) {
        return {
          success: true,
          user: signInRes.user,
          message: `Welcome back, ${cleanUsername}! Signed into existing ID.`
        };
      } else {
        return {
          success: false,
          error: `Pilot ID '${cleanUsername}' already exists. Please switch to SIGN IN WITH ID.`
        };
      }
    }

    if (error) {
      return { success: false, error: error.message };
    }

    // 2. Immediately sign in to establish active session token without any email confirmation
    const loginAttempt = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    const activeUser = loginAttempt.data?.user || data?.user;
    if (activeUser) {
      currentUser = activeUser;
      currentSession = loginAttempt.data?.session || data?.session;
      syncPlayerWithUser(activeUser);

      return {
        success: true,
        user: activeUser,
        message: `Pilot ID '${cleanUsername}' created! Identity authorized.`
      };
    }

    return { success: false, error: 'Registration failed. Please check your passcode and try again.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Sign in existing user with Pilot ID (or email) and password.
 * 
 * @param {object} credentials { identifier, password }
 * @returns {Promise<{ success: boolean, user?: object, message?: string, error?: string }>}
 */
export async function signInUser({ identifier, password }) {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error: 'Supabase credentials not configured in .env'
    };
  }

  const rawId = (identifier || '').trim();
  if (!rawId) {
    return { success: false, error: 'Please enter your Pilot ID.' };
  }
  if (!password) {
    return { success: false, error: 'Please enter your passcode.' };
  }

  const email = normalizeIdentifier(rawId);
  const displayId = rawId.includes('@') ? rawId.split('@')[0] : rawId;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        return {
          success: false,
          error: 'Invalid Pilot ID or passcode. If you are new, click CREATE NEW ID.'
        };
      }
      return { success: false, error: error.message };
    }

    if (data?.user) {
      currentUser = data.user;
      currentSession = data.session;
      syncPlayerWithUser(data.user);
      return {
        success: true,
        user: data.user,
        message: `Welcome back, ${gameState.player.name || displayId}!`
      };
    }

    return { success: false, error: 'Sign in failed. Check your ID & passcode.' };
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
 * Switches between Gateway Screen tabs on the landing page.
 */
function switchGatewayTab(tab) {
  const tabSignIn = document.getElementById('gateway-tab-signin');
  const tabSignUp = document.getElementById('gateway-tab-signup');
  const formSignIn = document.getElementById('gateway-form-signin');
  const formSignUp = document.getElementById('gateway-form-signup');
  const cardTitle = document.getElementById('gateway-card-title');

  if (tab === 'signup') {
    if (tabSignIn) tabSignIn.classList.remove('active');
    if (tabSignUp) tabSignUp.classList.add('active');
    if (formSignIn) formSignIn.style.display = 'none';
    if (formSignUp) formSignUp.style.display = 'block';
    if (cardTitle) cardTitle.textContent = 'CREATE PILOT ID';
  } else {
    if (tabSignUp) tabSignUp.classList.remove('active');
    if (tabSignIn) tabSignIn.classList.add('active');
    if (formSignUp) formSignUp.style.display = 'none';
    if (formSignIn) formSignIn.style.display = 'block';
    if (cardTitle) cardTitle.textContent = 'PILOT AUTHORIZATION';
  }
}

/**
 * Sets alert banner on the Gateway Screen.
 */
function setGatewayAlert(msg, type = 'none') {
  const alertEl = document.getElementById('gateway-alert-banner');
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

/**
 * Sets up event handlers on the Gateway Screen on the landing page.
 */
function setupGatewayScreenEvents() {
  const tabSignIn = document.getElementById('gateway-tab-signin');
  const tabSignUp = document.getElementById('gateway-tab-signup');
  const formSignIn = document.getElementById('gateway-form-signin');
  const formSignUp = document.getElementById('gateway-form-signup');

  if (tabSignIn && tabSignUp) {
    tabSignIn.addEventListener('click', () => {
      sounds.playClick();
      switchGatewayTab('signin');
    });
    tabSignUp.addEventListener('click', () => {
      sounds.playClick();
      switchGatewayTab('signup');
    });
  }

  if (formSignIn) {
    formSignIn.addEventListener('submit', async (e) => {
      e.preventDefault();
      sounds.playClick();
      const identifier = document.getElementById('gateway-signin-id')?.value || '';
      const password = document.getElementById('gateway-signin-password')?.value || '';
      const btn = document.getElementById('gateway-btn-submit-signin');

      setGatewayAlert('', 'none');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>TRANSMITTING AUTH CREDENTIALS...</span>';
      }

      const res = await signInUser({ identifier, password });
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>⚡ AUTHORIZE &amp; ENTER ARENA</span>';
      }

      if (res.success) {
        sounds.playReward();
        setGatewayAlert(res.message, 'success');
        setTimeout(() => {
          handleScreenAccess(res.user);
        }, 500);
      } else {
        sounds.playClick();
        setGatewayAlert(res.error || 'Authentication failed', 'error');
      }
    });
  }

  if (formSignUp) {
    formSignUp.addEventListener('submit', async (e) => {
      e.preventDefault();
      sounds.playClick();
      const identifier = document.getElementById('gateway-signup-id')?.value || '';
      const password = document.getElementById('gateway-signup-password')?.value || '';
      const btn = document.getElementById('gateway-btn-submit-signup');

      setGatewayAlert('', 'none');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>ACTIVATING PILOT ID...</span>';
      }

      const res = await signUpUser({ identifier, password });
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>🛡️ CREATE PILOT ID &amp; ENTER ARENA</span>';
      }

      if (res.success) {
        sounds.playReward();
        setGatewayAlert(res.message, 'success');
        setTimeout(() => {
          handleScreenAccess(res.user);
        }, 600);
      } else {
        sounds.playClick();
        setGatewayAlert(res.error || 'Pilot ID creation failed', 'error');
      }
    });
  }
}

/**
 * Manages transition between Gateway Screen and Home Screen, and redirects if page requires auth.
 */
function handleScreenAccess(user, requireAuth = false) {
  const gatewayScreen = document.getElementById('auth-gateway-screen');
  const homeScreen = document.getElementById('home-screen');

  if (gatewayScreen && homeScreen) {
    if (user) {
      document.documentElement.classList.add('auth-session-cached');
      gatewayScreen.classList.remove('active');
      homeScreen.classList.add('active');
    } else {
      document.documentElement.classList.remove('auth-session-cached');
      gatewayScreen.classList.add('active');
      homeScreen.classList.remove('active');
      closeAuthModal();
    }
  } else if (requireAuth && !user) {
    window.location.href = '/?auth=required';
  }
}

/**
 * Initializes the Auth HUD Widget, Gateway Screen, and Modal across pages.
 */
export function initAuthUI({ requireAuth = false } = {}) {
  // 1. Setup Gateway Screen listeners if present on index.html
  setupGatewayScreenEvents();

  // 2. Initial check
  checkInitialAuth().then(user => {
    updateAuthHUD(user);
    handleScreenAccess(user, requireAuth);
  });

  // 3. Subscribe to auth changes
  onAuthStateChanged(user => {
    updateAuthHUD(user);
    handleScreenAccess(user, requireAuth);
  });

  // 4. Inject Auth Modal into DOM if not present
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
          <span class="modal-badge-tag">INSTANT ACCESS &bull; NO EMAIL CONFIRMATION NEEDED</span>
          <h3 class="modal-main-title" id="auth-modal-main-title">PILOT AUTHORIZATION</h3>
        </div>
        <button class="modal-close-btn" id="btn-close-auth-modal" title="Close">✕</button>
      </div>

      <!-- Auth Body -->
      <div class="modal-body auth-modal-body">
        
        <!-- Auth Tabs -->
        <div class="auth-tabs-row" id="auth-tabs-row">
          <button class="auth-tab-btn active" id="tab-btn-signin" data-tab="signin">
            <span>🔑 SIGN IN WITH ID</span>
          </button>
          <button class="auth-tab-btn" id="tab-btn-signup" data-tab="signup">
            <span>🛡️ CREATE NEW ID</span>
          </button>
        </div>

        <!-- Alert Banner -->
        <div class="auth-alert-banner" id="auth-alert-banner" style="display: none;"></div>

        <!-- TAB 1: SIGN IN FORM -->
        <form class="auth-form-panel active" id="form-signin" autocomplete="on">
          <div class="auth-field-group">
            <label for="signin-id" class="auth-field-label">PILOT ID / CALLSIGN</label>
            <input 
              type="text" 
              id="signin-id" 
              class="auth-input-control" 
              placeholder="e.g. ShadowBlade_99" 
              required 
              autocomplete="username"
            >
            <span class="auth-field-hint highlight">⚡ Enter your Pilot ID (or email)</span>
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

        <!-- TAB 2: CREATE ID FORM -->
        <form class="auth-form-panel" id="form-signup" autocomplete="on" style="display: none;">
          <div class="auth-field-group">
            <label for="signup-id" class="auth-field-label">CHOOSE PILOT ID / CALLSIGN</label>
            <input 
              type="text" 
              id="signup-id" 
              class="auth-input-control" 
              placeholder="e.g. CyberValkyrie_01" 
              required 
              minlength="3"
              autocomplete="username"
            >
            <span class="auth-field-hint highlight">✨ Instant activation · No email confirmation required</span>
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
              <span>🛡️ CREATE PILOT ID &amp; ENTER</span>
            </button>
          </div>
        </form>

        <!-- LOGGED-IN PROFILE VIEW -->
        <div class="auth-profile-panel" id="panel-profile" style="display: none;">
          <div class="profile-card-header">
            <div class="profile-avatar-box">👤</div>
            <div class="profile-meta-info">
              <h4 class="profile-name" id="profile-display-name">NeoCoder</h4>
              <span class="profile-email" id="profile-display-email">PILOT ID: NeoCoder</span>
              <span class="profile-status-tag">🟢 SUPABASE CLOUD ACTIVE</span>
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
              <span class="stat-lbl">AUTH STATUS</span>
              <strong class="stat-val">INSTANT ID (JWT)</strong>
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
      const identifier = document.getElementById('signin-id')?.value || '';
      const password = document.getElementById('signin-password')?.value || '';
      const btn = document.getElementById('btn-submit-signin');

      setAlert('', 'none');
      btn.disabled = true;
      btn.innerHTML = '<span>TRANSMITTING AUTH CREDENTIALS...</span>';

      const res = await signInUser({ identifier, password });
      btn.disabled = false;
      btn.innerHTML = '<span>⚡ AUTHORIZE &amp; ENTER ARENA</span>';

      if (res.success) {
        sounds.playReward();
        setAlert(res.message, 'success');
        setTimeout(() => {
          closeAuthModal();
        }, 1000);
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
      const identifier = document.getElementById('signup-id')?.value || '';
      const password = document.getElementById('signup-password')?.value || '';
      const btn = document.getElementById('btn-submit-signup');

      setAlert('', 'none');
      btn.disabled = true;
      btn.innerHTML = '<span>ACTIVATING PILOT ID...</span>';

      const res = await signUpUser({ identifier, password });
      btn.disabled = false;
      btn.innerHTML = '<span>🛡️ CREATE PILOT ID &amp; ENTER</span>';

      if (res.success) {
        sounds.playReward();
        setAlert(res.message, 'success');
        setTimeout(() => {
          closeAuthModal();
        }, 1200);
      } else {
        sounds.playClick();
        setAlert(res.error || 'Pilot ID registration failed', 'error');
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

  if (titleEl) titleEl.textContent = 'PILOT PROFILE';

  const nameEl = document.getElementById('profile-display-name');
  const emailEl = document.getElementById('profile-display-email');
  const clanEl = document.getElementById('profile-clan-val');
  const cpEl = document.getElementById('profile-cp-val');
  const lvlEl = document.getElementById('profile-lvl-val');

  const username = user.user_metadata?.username || user.email.split('@')[0];
  if (nameEl) nameEl.textContent = username;
  if (emailEl) {
    if (user.email && user.email.endsWith('@skillgym.io')) {
      emailEl.textContent = `PILOT ID: ${username}`;
    } else {
      emailEl.textContent = user.email;
    }
  }
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
    if (titleEl) titleEl.textContent = 'CREATE PILOT ID';
  } else {
    if (tabSignUp) tabSignUp.classList.remove('active');
    if (tabSignIn) tabSignIn.classList.add('active');
    if (formSignUp) formSignUp.style.display = 'none';
    if (formSignIn) formSignIn.style.display = 'block';
    if (titleEl) titleEl.textContent = 'PILOT AUTHORIZATION';
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
