// Clan Headquarters Controller for SkillGYM (clan.html)
import { gameState, saveState } from './data.js';
import { sounds } from './audio.js';

// DOM Elements
const modalContainer = document.getElementById('modal-container');
const crosshairContainer = document.getElementById('crosshair-container');
const clanBgmIndicator = document.getElementById('clan-bgm-indicator');
const cardClanInfo = document.getElementById('card-clan-info');
const cardClanWar = document.getElementById('card-clan-war');
const btnLeaveClan = document.getElementById('btn-leave-clan');
const promptLeaveHub = document.getElementById('prompt-leave-hub');
const promptBackHub = document.getElementById('prompt-back-hub');

const hudCp = document.getElementById('clan-hud-cp');
const hudClanName = document.getElementById('clan-hud-name');
const hudClanTag = document.getElementById('clan-hud-tag');
const hudClanEmblem = document.getElementById('clan-hud-emblem');

let currentClan = null;

// Find active player clan or default to BitKnights
function getActiveClan() {
  const playerClanName = gameState.player.clan || 'BitKnights';
  const found = gameState.clanRoster.find(c => c.name.toLowerCase() === playerClanName.toLowerCase() || c.joined);
  if (found) {
    found.joined = true;
    gameState.player.clan = found.name;
    return found;
  }
  // Fallback to first clan
  const fallback = gameState.clanRoster[0];
  fallback.joined = true;
  gameState.player.clan = fallback.name;
  return fallback;
}

// Update Top HUD
function updateClanHUD() {
  currentClan = getActiveClan();

  if (hudCp) hudCp.textContent = gameState.player.codePoints.toLocaleString();
  if (hudClanName) hudClanName.textContent = currentClan.name;
  if (hudClanTag) hudClanTag.textContent = currentClan.tag;
  if (hudClanEmblem) hudClanEmblem.textContent = currentClan.icon;

  const identityBadge = document.getElementById('clan-identity-badge');
  if (identityBadge && currentClan.bannerColor) {
    identityBadge.style.borderColor = currentClan.bannerColor;
  }
}

// Tactical Click Crosshair Effect
function spawnCrosshair(x, y) {
  if (!crosshairContainer) return;
  sounds.playCrosshair();

  const burst = document.createElement('div');
  burst.className = 'crosshair-burst';
  burst.style.left = `${x}px`;
  burst.style.top = `${y}px`;

  burst.innerHTML = `
    <div class="crosshair-ring"></div>
    <div class="crosshair-corners"></div>
    <div class="crosshair-center-dot"></div>
    <div class="crosshair-coords">LOC [${Math.round(x)}, ${Math.round(y)}] // LOCK</div>
  `;

  crosshairContainer.appendChild(burst);
  setTimeout(() => burst.remove(), 550);
}

// Modal helper
function openModal(htmlContent, modalClass = '') {
  sounds.playModalOpen();
  modalContainer.innerHTML = `
    <div class="modal-dialog ${modalClass}" role="dialog" aria-modal="true">
      <button class="modal-close-btn" id="modal-close-btn" aria-label="Close modal">✕</button>
      ${htmlContent}
    </div>
  `;
  modalContainer.classList.add('active');

  const closeBtn = document.getElementById('modal-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
}

function closeModal() {
  sounds.playModalClose();
  modalContainer.classList.remove('active');
  modalContainer.innerHTML = '';
}

// Click outside to close modal
if (modalContainer) {
  modalContainer.addEventListener('click', (e) => {
    if (e.target === modalContainer) closeModal();
  });
}

// ==================== 1. CLAN INFO MODAL ====================
function openClanInfoModal() {
  sounds.playClick();
  currentClan = getActiveClan();

  const mockMembers = [
    { name: currentClan.leader, role: 'Guildmaster', cp: '4,850 CP', status: 'ONLINE', avatar: '👑' },
    { name: 'NeoCoder_42 (You)', role: 'Commander', cp: '2,840 CP', status: 'ONLINE', avatar: '⚡' },
    { name: 'BinaryPhantom', role: 'Elite Duelist', cp: '2,410 CP', status: 'IN DUEL', avatar: '🛡️' },
    { name: 'AlgorithmQueen', role: 'Veteran', cp: '1,980 CP', status: 'IDLE', avatar: '💎' },
    { name: 'CacheOverlord', role: 'Member', cp: '1,540 CP', status: 'OFFLINE', avatar: '🦾' },
    { name: 'SyntaxStriker', role: 'Member', cp: '1,200 CP', status: 'ONLINE', avatar: '🏹' }
  ];

  const membersRows = mockMembers.map(m => `
    <tr class="member-row ${m.name.includes('(You)') ? 'is-player' : ''}">
      <td class="member-user-cell">
        <span class="member-avatar-chip">${m.avatar}</span>
        <div>
          <strong class="member-name">${m.name}</strong>
          <span class="member-role-sub">${m.role}</span>
        </div>
      </td>
      <td class="member-stat-cell"><strong class="highlight-gold">${m.cp}</strong></td>
      <td class="member-status-cell">
        <span class="status-indicator ${m.status.toLowerCase().replace(' ', '-')}">${m.status}</span>
      </td>
    </tr>
  `).join('');

  const content = `
    <div class="modal-header clan-info-header">
      <div class="modal-title-wrap">
        <span class="modal-badge-tag cyan-tag">GUILD PROFILE</span>
        <h2 class="modal-title">${currentClan.name} ${currentClan.tag}</h2>
      </div>
      <div class="header-stat">
        <span>Global Syndicate Rank</span>
        <strong style="color: #38BDF8">#3 WORLDWIDE</strong>
      </div>
    </div>
    <div class="modal-body">
      <!-- Guild Banner Showcase -->
      <div class="clan-profile-banner" style="border-left: 4px solid ${currentClan.bannerColor}">
        <div class="profile-emblem-wrap" style="border-color:${currentClan.bannerColor}; box-shadow: 0 0 20px ${currentClan.bannerColor}55">
          ${currentClan.icon}
        </div>
        <div class="profile-info-content">
          <div class="profile-top-line">
            <h3>${currentClan.name} <span class="clan-tag-badge">${currentClan.tag}</span></h3>
            <span class="clan-rating-badge">⭐ ${currentClan.rating}</span>
          </div>
          <span class="clan-buff-tag">🔥 Active Perk: ${currentClan.buff}</span>
          <p class="clan-perk-desc">${currentClan.perk}</p>
          <div class="clan-stats-bar">
            <span>Members: <strong>${currentClan.members}</strong></span>
            <span>Founder: <strong>${currentClan.leader}</strong></span>
            <span>Vault Treasury: <strong style="color:#FACC15">45,000 CP</strong></span>
          </div>
        </div>
      </div>

      <!-- Guild Tabs Section -->
      <div class="clan-info-tabs-bar">
        <button class="info-tab-btn active" id="tab-members">MEMBERS ROSTER (${mockMembers.length})</button>
        <button class="info-tab-btn" id="tab-vault">ALGORITHM VAULT (12)</button>
        <button class="info-tab-btn" id="tab-perks">ACTIVE BUFFS</button>
      </div>

      <div class="clan-tab-content-area" id="clan-tab-content">
        <div class="clan-members-table-wrap">
          <table class="clan-members-table">
            <thead>
              <tr>
                <th>DEVELOPER</th>
                <th>CONTRIBUTION</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              ${membersRows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  openModal(content, 'clan-info-modal');

  // Sub-tabs interaction
  const tabContent = document.getElementById('clan-tab-content');
  const tabs = document.querySelectorAll('.info-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      sounds.playHover();
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      if (tab.id === 'tab-members') {
        tabContent.innerHTML = `
          <div class="clan-members-table-wrap">
            <table class="clan-members-table">
              <thead><tr><th>DEVELOPER</th><th>CONTRIBUTION</th><th>STATUS</th></tr></thead>
              <tbody>${membersRows}</tbody>
            </table>
          </div>
        `;
      } else if (tab.id === 'tab-vault') {
        tabContent.innerHTML = `
          <div class="vault-decks-grid">
            <div class="vault-deck-card">
              <span class="vault-cat-tag">ALGO VAULT</span>
              <h4>Dijkstra & A* Pathfinding Suite</h4>
              <p>Optimized with Fibonacci heap for lightning-fast graph cycles.</p>
              <div class="vault-deck-footer">
                <span>⭐ Mastered</span>
                <button class="vault-use-btn" id="btn-copy-deck">EQUIP DECK</button>
              </div>
            </div>
            <div class="vault-deck-card">
              <span class="vault-cat-tag">MEMORY SHIELD</span>
              <h4>Zero-Allocation LRU Cache</h4>
              <p>O(1) lookups with double linked list and atomic bit masks.</p>
              <div class="vault-deck-footer">
                <span>⭐ Mastered</span>
                <button class="vault-use-btn">EQUIP DECK</button>
              </div>
            </div>
            <div class="vault-deck-card">
              <span class="vault-cat-tag">CONCURRENCY</span>
              <h4>Lock-Free Ring Buffer</h4>
              <p>Atomic ring buffer designed for competitive PvP multi-threading duels.</p>
              <div class="vault-deck-footer">
                <span>⭐ Mastered</span>
                <button class="vault-use-btn">EQUIP DECK</button>
              </div>
            </div>
          </div>
        `;
        const equipBtns = tabContent.querySelectorAll('.vault-use-btn');
        equipBtns.forEach(btn => {
          btn.addEventListener('click', () => {
            sounds.playReward();
            btn.textContent = 'EQUIPPED! ✓';
            btn.style.background = '#10B981';
          });
        });
      } else if (tab.id === 'tab-perks') {
        tabContent.innerHTML = `
          <div class="perks-display-grid">
            <div class="perk-detail-box active">
              <span class="perk-ico">🔥</span>
              <div>
                <h4>${currentClan.buff}</h4>
                <p>Applies to all active clan members during Ranked and Quick 1v1 Algorithmic Duels.</p>
                <span class="perk-active-badge">STATUS: ACTIVE & ACCELERATED</span>
              </div>
            </div>
            <div class="perk-detail-box active">
              <span class="perk-ico">🛡️</span>
              <div>
                <h4>Syndicate Raid Pass Overclock</h4>
                <p>Instant priority queue matchmaking when challenging weekly Bug Titan Bosses.</p>
                <span class="perk-active-badge">STATUS: ACTIVE & ACCELERATED</span>
              </div>
            </div>
          </div>
        `;
      }
    });
  });
}

// ==================== 2. CLAN WAR MODAL ====================
function openClanWarModal() {
  sounds.playBattle();
  currentClan = getActiveClan();

  const rivalClan = gameState.clanRoster.find(c => c.name !== currentClan.name) || {
    name: 'CyberDragons',
    tag: '[DRGN]',
    rating: '15,200 CP',
    icon: '🐉',
    bannerColor: '#EF4444'
  };

  const content = `
    <div class="modal-header clan-war-header">
      <div class="modal-title-wrap">
        <span class="modal-badge-tag orange-tag">SEASON 4 CLASH</span>
        <h2 class="modal-title">SYNDICATE CLAN WAR</h2>
      </div>
      <div class="header-stat">
        <span>Prize Bounty Pool</span>
        <strong style="color: #FACC15">50,000 CP + TITAN CREST</strong>
      </div>
    </div>
    <div class="modal-body">
      <!-- Head to Head Clash Arena -->
      <div class="war-vs-banner">
        <div class="war-clan-side clan-home">
          <div class="war-emblem" style="border-color:${currentClan.bannerColor}; box-shadow: 0 0 20px ${currentClan.bannerColor}66">
            ${currentClan.icon}
          </div>
          <h3 class="war-clan-title">${currentClan.name}</h3>
          <span class="clan-tag-badge">${currentClan.tag}</span>
          <span class="war-score-text">14,820 CP</span>
        </div>

        <div class="war-vs-center">
          <span class="war-vs-pill">VS</span>
          <div class="war-countdown-box">
            <span class="countdown-label">TIME REMAINING</span>
            <strong class="countdown-timer">18h : 42m : 10s</strong>
          </div>
        </div>

        <div class="war-clan-side clan-away">
          <div class="war-emblem" style="border-color:${rivalClan.bannerColor}; box-shadow: 0 0 20px ${rivalClan.bannerColor}66">
            ${rivalClan.icon}
          </div>
          <h3 class="war-clan-title">${rivalClan.name}</h3>
          <span class="clan-tag-badge" style="color: #EF4444">${rivalClan.tag}</span>
          <span class="war-score-text">15,200 CP</span>
        </div>
      </div>

      <!-- Live Battle Sectors -->
      <h4 class="war-subheading">ACTIVE WAR SECTORS</h4>
      <div class="war-sectors-grid">
        <div class="war-sector-card sector-leading">
          <div class="sector-head">
            <span class="sector-badge">SECTOR 1 • LEADING</span>
            <span class="sector-pts">+1,200 CP</span>
          </div>
          <h4>Memory Leak Containment</h4>
          <p>Optimize garbage collection and heap buffers under extreme server load.</p>
          <div class="sector-progress-bar">
            <div class="progress-fill home-fill" style="width: 58%"></div>
          </div>
          <span class="sector-ratio">58% BitKnights vs 42% CyberDragons</span>
        </div>

        <div class="war-sector-card sector-contested">
          <div class="sector-head">
            <span class="sector-badge orange-badge">SECTOR 2 • CONTESTED</span>
            <span class="sector-pts">+2,500 CP</span>
          </div>
          <h4>Graph Algorithm Siege</h4>
          <p>Solve dynamic shortest-path queries across 1,000,000 weighted nodes.</p>
          <div class="sector-progress-bar">
            <div class="progress-fill home-fill" style="width: 48%"></div>
          </div>
          <span class="sector-ratio">48% BitKnights vs 52% CyberDragons</span>
        </div>

        <div class="war-sector-card sector-boss">
          <div class="sector-head">
            <span class="sector-badge purple-badge">SECTOR 3 • TITAN BOSS</span>
            <span class="sector-pts">+5,000 CP</span>
          </div>
          <h4>NullPointerException Behemoth</h4>
          <p>Cooperative 5-developer boss raid duel. Defeat before server crash.</p>
          <div class="sector-progress-bar">
            <div class="progress-fill boss-fill" style="width: 35%"></div>
          </div>
          <span class="sector-ratio">Boss HP: 35% Remaining</span>
        </div>
      </div>

      <!-- Action Button -->
      <div class="war-action-row">
        <div id="war-deploy-msg" class="war-deploy-msg"></div>
        <button class="war-deploy-btn" id="btn-deploy-war">
          <span>⚔️ DEPLOY SQUAD TO WAR SECTOR</span>
        </button>
      </div>
    </div>
  `;

  openModal(content, 'clan-war-modal');

  const deployBtn = document.getElementById('btn-deploy-war');
  const deployMsg = document.getElementById('war-deploy-msg');
  if (deployBtn) {
    deployBtn.addEventListener('click', () => {
      sounds.playReward();
      deployBtn.disabled = true;
      deployBtn.innerHTML = `<span>⚡ DEPLOYING SQUAD...</span>`;

      setTimeout(() => {
        const rewardCP = 350;
        gameState.player.codePoints += rewardCP;
        saveState();
        updateClanHUD();

        sounds.playBattle();
        deployBtn.innerHTML = `<span>✓ SECTOR SECURED! (+${rewardCP} CP)</span>`;
        deployBtn.style.background = 'linear-gradient(135deg, #10B981, #059669)';

        if (deployMsg) {
          deployMsg.innerHTML = `<span style="color:#10B981; font-weight:700;">Victory! Your algorithmic solution scored 99.4% efficiency. Sector secured!</span>`;
        }
      }, 1200);
    });
  }
}

// ==================== 3. RED LEAVE BUTTON CONFIRMATION ====================
function openLeaveClanModal() {
  sounds.playClick();
  currentClan = getActiveClan();

  const content = `
    <div class="modal-header clan-leave-header">
      <div class="modal-title-wrap">
        <span class="modal-badge-tag red-tag">DANGER ZONE</span>
        <h2 class="modal-title" style="color: #EF4444">LEAVE CLAN</h2>
      </div>
    </div>
    <div class="modal-body">
      <div class="clan-leave-warning-box">
        <div class="warning-icon-wrap">⚠️</div>
        <div class="warning-text-wrap">
          <h3>Are you sure you want to leave ${currentClan.name}?</h3>
          <p>
            You will forfeit all guild privileges, including your <strong>${currentClan.buff}</strong> multiplier,
            access to <strong>12 shared algorithm vault decks</strong>, and your Syndicate Clan War raid progress.
          </p>
        </div>
      </div>

      <div class="clan-leave-actions">
        <button class="cancel-leave-btn" id="btn-cancel-leave">
          NEVER MIND, STAY IN CLAN
        </button>
        <button class="confirm-leave-btn red-danger-btn" id="btn-confirm-leave">
          <span>🚪 YES, CONFIRM & LEAVE CLAN</span>
        </button>
      </div>
    </div>
  `;

  openModal(content, 'clan-leave-dialog-modal');

  const cancelBtn = document.getElementById('btn-cancel-leave');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeModal);
  }

  const confirmBtn = document.getElementById('btn-confirm-leave');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      sounds.playClick();

      // Clear player clan
      gameState.player.clan = null;
      gameState.clanRoster.forEach(c => c.joined = false);
      saveState();

      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<span>LEAVING CLAN...</span>`;

      setTimeout(() => {
        // Redirect back to Hub where they can join/create a clan
        window.location.href = '/#clan';
      }, 600);
    });
  }
}

// Littleroot BGM Controller
function toggleLittlerootBGM() {
  const isPlaying = sounds.toggleBGM();
  if (clanBgmIndicator) {
    clanBgmIndicator.classList.toggle('playing', isPlaying);
  }
}

// Attach Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  updateClanHUD();

  // Pointer click crosshair
  window.addEventListener('pointerdown', (e) => {
    spawnCrosshair(e.clientX, e.clientY);

    // Autoplay BGM on first interaction
    if (!sounds.bgmStarted && sounds.bgmEnabled) {
      sounds.startBGM();
      if (clanBgmIndicator) clanBgmIndicator.classList.add('playing');
    }
  });

  // BGM Indicator Click
  if (clanBgmIndicator) {
    clanBgmIndicator.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLittlerootBGM();
    });
  }

  // Hero Card 1: CLAN INFO
  if (cardClanInfo) {
    cardClanInfo.addEventListener('click', () => {
      openClanInfoModal();
    });
  }

  // Hero Card 2: CLAN WAR
  if (cardClanWar) {
    cardClanWar.addEventListener('click', () => {
      openClanWarModal();
    });
  }

  // RED LEAVE BUTTON in top corner
  if (btnLeaveClan) {
    btnLeaveClan.addEventListener('click', (e) => {
      e.stopPropagation();
      openLeaveClanModal();
    });
  }

  // Bottom prompt leave
  if (promptLeaveHub) {
    promptLeaveHub.addEventListener('click', (e) => {
      e.stopPropagation();
      openLeaveClanModal();
    });
  }

  // Bottom prompt back
  if (promptBackHub) {
    promptBackHub.addEventListener('click', () => {
      sounds.playClick();
      window.location.href = '/';
    });
  }

  // Hash routing for direct navigation / testing
  function handleHash() {
    const hash = window.location.hash;
    if (hash === '#info') {
      openClanInfoModal();
    } else if (hash === '#war') {
      openClanWarModal();
    } else if (hash === '#leave') {
      openLeaveClanModal();
    }
  }

  handleHash();
  window.addEventListener('hashchange', handleHash);

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (modalContainer.classList.contains('active')) {
      if (e.key === 'Escape') closeModal();
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'b':
      case 'escape':
        window.location.href = '/';
        break;
      case '1':
      case 'i':
        openClanInfoModal();
        break;
      case '2':
      case 'w':
        openClanWarModal();
        break;
      case 'x':
      case 'l':
        openLeaveClanModal();
        break;
    }
  });
});
