/**
 * World IM — Frontend Application
 *
 * The human's window into the world.
 * All interaction passes through the sole information channel (Socket.IO).
 * The human enters as an alien reasoner (PRD §6).
 */

(function () {
  'use strict';

  // ─── State ───
  const state = {
    socket: null,
    humanId: null,
    humanName: null,
    entered: false,
    messageTarget: 'world',
    messageTargetName: 'world',
    replyTo: null,
    inhabitants: [],
    targetModalOpen: false,
  };

  // ─── DOM Elements ───
  const dom = {
    entryGate: document.getElementById('entry-gate'),
    worldInterface: document.getElementById('world-interface'),
    nameInput: document.getElementById('name-input'),
    enterBtn: document.getElementById('enter-btn'),
    messageStream: document.getElementById('message-stream'),
    messageInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('send-btn'),
    statInhabitants: document.getElementById('stat-inhabitants'),
    statMessages: document.getElementById('stat-messages'),
    statEvents: document.getElementById('stat-events'),
    inhabitantList: document.getElementById('inhabitant-list'),
    targetLabel: document.getElementById('target-label'),
    changeTarget: document.getElementById('change-target'),
    replyIndicator: document.getElementById('reply-indicator'),
    replyToText: document.getElementById('reply-to-text'),
    cancelReply: document.getElementById('cancel-reply'),
  };

  // ─── Agent color map ───
  const agentColors = {
    Vera: 'var(--agent-vera)',
    Marsh: 'var(--agent-marsh)',
    Kael: 'var(--agent-kael)',
    Lumen: 'var(--agent-lumen)',
  };

  // ─── Initialize ───
  function init() {
    state.socket = io();
    bindEvents();
    bindSocketEvents();
  }

  // ─── Event Bindings ───
  function bindEvents() {
    // Enter the world
    dom.enterBtn.addEventListener('click', enterWorld);
    dom.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') enterWorld();
    });

    // Send message
    dom.sendBtn.addEventListener('click', sendMessage);
    dom.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-resize textarea
    dom.messageInput.addEventListener('input', () => {
      dom.messageInput.style.height = 'auto';
      dom.messageInput.style.height =
        Math.min(dom.messageInput.scrollHeight, 120) + 'px';
    });

    // Target selector
    dom.changeTarget.addEventListener('click', toggleTargetModal);

    // Cancel reply
    dom.cancelReply.addEventListener('click', clearReply);
  }

  // ─── Socket Events ───
  function bindSocketEvents() {
    const socket = state.socket;

    // World state update
    socket.on('world:state', (worldState) => {
      updateWorldStats(worldState);
      updateInhabitantList(worldState.inhabitants);
    });

    // Message history
    socket.on('world:history', (messages) => {
      for (const msg of messages) {
        renderMessage(msg, true);
      }
      scrollToBottom();
    });

    // New message
    socket.on('world:message', (message) => {
      renderMessage(message);
      scrollToBottom();
      updateMessageCount();
    });

    // Human entered confirmation
    socket.on('human:entered', (data) => {
      state.humanId = data.id;
      state.humanName = data.name;
      state.entered = true;
      addSystemMessage(`You have entered the world as ${data.name}.`);
    });
  }

  // ─── Enter the World ───
  function enterWorld() {
    const name = dom.nameInput.value.trim();
    if (!name) {
      dom.nameInput.focus();
      return;
    }

    state.humanName = name;
    state.socket.emit('human:enter', { name });

    dom.entryGate.classList.add('hidden');
    dom.worldInterface.classList.remove('hidden');
    dom.messageInput.focus();
  }

  // ─── Send Message ───
  function sendMessage() {
    const content = dom.messageInput.value.trim();
    if (!content) return;

    state.socket.emit('human:message', {
      content,
      to: state.messageTarget,
    });

    dom.messageInput.value = '';
    dom.messageInput.style.height = 'auto';
    clearReply();
  }

  // ─── Render a Message ───
  function renderMessage(message, isHistory) {
    if (message.type !== 'message') {
      // System events
      if (message.type === 'enter') {
        addSystemMessage(`${message.inhabitantName} has entered the world.`);
      } else if (message.type === 'leave') {
        addSystemMessage(`${message.inhabitantName} has left the world.`);
      }
      return;
    }

    const el = document.createElement('div');
    el.className = 'message';
    el.dataset.id = message.id;
    el.dataset.sender = message.fromName;

    // Is this a human message?
    const isHuman = message.from === state.humanId;
    if (isHuman) {
      el.classList.add('human');
    }

    // Fork indicator
    if (message.classification === 'fork') {
      el.classList.add('fork');
    }

    // Target display
    let targetText = '';
    if (message.to === 'world') {
      targetText = '→ world';
    } else {
      const target = state.inhabitants.find((i) => i.id === message.to);
      targetText = target ? `→ ${target.name}` : '→ ?';
    }

    el.innerHTML = `
      <div class="message-header">
        <span class="message-sender">${escapeHtml(message.fromName)}</span>
        <span class="message-target">${targetText}</span>
        <span class="message-seq">#${message.sequence}</span>
      </div>
      <div class="message-content">${escapeHtml(message.content)}</div>
      <div class="message-meta"></div>
    `;

    // Click to reply
    el.addEventListener('click', () => {
      setReplyTo(message);
    });

    dom.messageStream.appendChild(el);
  }

  // ─── System Messages ───
  function addSystemMessage(text) {
    const el = document.createElement('div');
    el.className = 'system-message';
    el.textContent = text;
    dom.messageStream.appendChild(el);
    scrollToBottom();
  }

  // ─── Update UI ───
  function updateWorldStats(worldState) {
    dom.statInhabitants.textContent = worldState.inhabitantCount;
    dom.statMessages.textContent = worldState.messageCount;
    dom.statEvents.textContent = worldState.totalEvents;
    state.inhabitants = worldState.inhabitants || [];
  }

  function updateInhabitantList(inhabitants) {
    state.inhabitants = inhabitants || [];
    dom.inhabitantList.innerHTML = '';

    for (const inhabitant of inhabitants) {
      const li = document.createElement('li');
      li.className = 'inhabitant-item';

      const isHuman = inhabitant.kind === 'human';
      const color = isHuman
        ? 'var(--human-accent)'
        : agentColors[inhabitant.name] || 'var(--accent)';

      li.innerHTML = `
        <span class="inhabitant-dot${isHuman ? ' human' : ''}" style="background: ${color}"></span>
        <span class="inhabitant-name">${escapeHtml(inhabitant.name)}</span>
        <span class="inhabitant-kind">${inhabitant.kind}</span>
      `;

      // Click to target
      li.addEventListener('click', () => {
        setTarget(inhabitant.id, inhabitant.name);
        closeTargetModal();
      });

      dom.inhabitantList.appendChild(li);
    }
  }

  function updateMessageCount() {
    const current = parseInt(dom.statMessages.textContent) || 0;
    dom.statMessages.textContent = current + 1;
    const events = parseInt(dom.statEvents.textContent) || 0;
    dom.statEvents.textContent = events + 1;
  }

  // ─── Target Selection ───
  function toggleTargetModal() {
    if (state.targetModalOpen) {
      closeTargetModal();
      return;
    }

    const existing = document.getElementById('target-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'target-modal';

    let html = '<h4>Direct message to</h4>';
    html += `<button class="target-option${
      state.messageTarget === 'world' ? ' active' : ''
    }" data-target="world" data-name="world">→ World (broadcast)</button>`;

    for (const inhabitant of state.inhabitants) {
      if (inhabitant.id === state.humanId) continue;
      html += `<button class="target-option${
        state.messageTarget === inhabitant.id ? ' active' : ''
      }" data-target="${inhabitant.id}" data-name="${escapeHtml(
        inhabitant.name
      )}">→ ${escapeHtml(inhabitant.name)}</button>`;
    }

    modal.innerHTML = html;
    document.body.appendChild(modal);
    state.targetModalOpen = true;

    // Bind target option clicks
    modal.querySelectorAll('.target-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        setTarget(btn.dataset.target, btn.dataset.name);
        closeTargetModal();
      });
    });

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', outsideClickHandler);
    }, 0);
  }

  function outsideClickHandler(e) {
    const modal = document.getElementById('target-modal');
    if (modal && !modal.contains(e.target) && e.target !== dom.changeTarget) {
      closeTargetModal();
    }
  }

  function closeTargetModal() {
    const modal = document.getElementById('target-modal');
    if (modal) modal.remove();
    state.targetModalOpen = false;
    document.removeEventListener('click', outsideClickHandler);
  }

  function setTarget(targetId, targetName) {
    state.messageTarget = targetId;
    state.messageTargetName = targetName;
    dom.targetLabel.textContent = `→ ${targetName}`;
  }

  // ─── Reply ───
  function setReplyTo(message) {
    state.replyTo = message.id;
    dom.replyToText.textContent = `Replying to ${message.fromName}: "${message.content.substring(0, 60)}${message.content.length > 60 ? '...' : ''}"`;
    dom.replyIndicator.classList.remove('hidden');

    // Auto-set target to the message sender
    if (message.from !== state.humanId) {
      setTarget(message.from, message.fromName);
    }

    dom.messageInput.focus();
  }

  function clearReply() {
    state.replyTo = null;
    dom.replyIndicator.classList.add('hidden');
  }

  // ─── Utilities ───
  function scrollToBottom() {
    requestAnimationFrame(() => {
      dom.messageStream.scrollTop = dom.messageStream.scrollHeight;
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Boot ───
  init();
})();
