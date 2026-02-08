/**
 * World IM — Browser Application (ES Module)
 *
 * All world logic runs client-side.
 * The human enters as an alien reasoner (PRD §6).
 */

import { World } from './world.js';
import { HumanInhabitant } from './agent.js';
import { createDefaultAgents } from './agents.js';

// ─── Initialize the World ───
const world = new World();
const agents = createDefaultAgents();
for (const agent of agents) {
  world.enter(agent);
}

// ─── State ───
const state = {
  humanId: null,
  humanName: null,
  entered: false,
  messageTarget: 'world',
  messageTargetName: 'world',
  replyTo: null,
  inhabitants: [],
  targetModalOpen: false,
  agentLoopId: null,
};

// ─── Agent Colors ───
const agentColors = {
  Vera: 'var(--agent-vera)',
  Marsh: 'var(--agent-marsh)',
  Kael: 'var(--agent-kael)',
  Lumen: 'var(--agent-lumen)',
};

// ─── DOM ───
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

// ─── World Event: new message → agents may respond ───
world.on('message', (message) => {
  renderMessage(message);
  scrollToBottom();
  updateStats();

  // Agents respond (with delay for natural feel)
  const responding = agents.filter(a => a.id !== message.from);
  for (const agent of responding) {
    const delay = 1500 + Math.random() * 4000;
    setTimeout(() => {
      const ws = world.getState();
      const response = agent.decideAndRespond(message, ws);
      if (response) {
        world.processMessage(response);
      }
    }, delay);
  }
});

world.on('inhabitant:enter', ({ inhabitant, event }) => {
  if (state.entered) {
    addSystemMessage(`${inhabitant.name} has entered the world.`);
  }
  updateInhabitantList();
  updateStats();
});

world.on('inhabitant:leave', ({ inhabitantId, event }) => {
  updateInhabitantList();
  updateStats();
});

// ─── Agent autonomous behavior loop ───
function startAgentLoop() {
  state.agentLoopId = setInterval(() => {
    const ws = world.getState();
    for (const agent of agents) {
      const initiation = agent.initiate(ws);
      if (initiation) {
        world.processMessage(initiation);
      }
    }
  }, 15000 + Math.random() * 10000);
}

// ─── UI Bindings ───
dom.enterBtn.addEventListener('click', enterWorld);
dom.nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') enterWorld();
});
dom.sendBtn.addEventListener('click', sendMessage);
dom.messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
dom.messageInput.addEventListener('input', () => {
  dom.messageInput.style.height = 'auto';
  dom.messageInput.style.height = Math.min(dom.messageInput.scrollHeight, 120) + 'px';
});
dom.changeTarget.addEventListener('click', toggleTargetModal);
dom.cancelReply.addEventListener('click', clearReply);

// ─── Enter the World ───
function enterWorld() {
  const name = dom.nameInput.value.trim();
  if (!name) { dom.nameInput.focus(); return; }

  const human = new HumanInhabitant({ name });
  world.enter(human);

  state.humanId = human.id;
  state.humanName = name;
  state.entered = true;

  dom.entryGate.classList.add('hidden');
  dom.worldInterface.classList.remove('hidden');

  addSystemMessage(`You have entered the world as ${name}.`);
  updateInhabitantList();
  updateStats();

  // Show existing messages
  const history = world.getRecentMessages(50);
  // Messages already rendered via world events, but let's scroll
  scrollToBottom();
  dom.messageInput.focus();
}

// ─── Send Message ───
function sendMessage() {
  const content = dom.messageInput.value.trim();
  if (!content || !state.humanId) return;

  world.processMessage({
    from: state.humanId,
    to: state.messageTarget,
    content,
  });

  dom.messageInput.value = '';
  dom.messageInput.style.height = 'auto';
  clearReply();
}

// ─── Render Message ───
function renderMessage(message) {
  if (message.type !== 'message') return;

  const el = document.createElement('div');
  el.className = 'message';
  el.dataset.id = message.id;
  el.dataset.sender = message.fromName;

  if (message.from === state.humanId) el.classList.add('human');
  if (message.classification === 'fork') el.classList.add('fork');

  let targetText = '';
  if (message.to === 'world') {
    targetText = '→ world';
  } else {
    const target = world.getInhabitants().find(i => i.id === message.to);
    targetText = target ? `→ ${target.name}` : '→ ?';
  }

  el.innerHTML = `
    <div class="message-header">
      <span class="message-sender">${esc(message.fromName)}</span>
      <span class="message-target">${targetText}</span>
      <span class="message-seq">#${message.sequence}</span>
    </div>
    <div class="message-content">${esc(message.content)}</div>
    <div class="message-meta"></div>
  `;

  el.addEventListener('click', () => setReplyTo(message));
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

// ─── Update Stats ───
function updateStats() {
  const s = world.getState();
  dom.statInhabitants.textContent = s.inhabitantCount;
  dom.statMessages.textContent = s.messageCount;
  dom.statEvents.textContent = s.totalEvents;
}

// ─── Inhabitant List ───
function updateInhabitantList() {
  const inhabitants = world.getInhabitants();
  state.inhabitants = inhabitants;
  dom.inhabitantList.innerHTML = '';

  for (const inhabitant of inhabitants) {
    const li = document.createElement('li');
    li.className = 'inhabitant-item';
    const isHuman = inhabitant.kind === 'human';
    const color = isHuman ? 'var(--human-accent)' : (agentColors[inhabitant.name] || 'var(--accent)');

    li.innerHTML = `
      <span class="inhabitant-dot${isHuman ? ' human' : ''}" style="background: ${color}"></span>
      <span class="inhabitant-name">${esc(inhabitant.name)}</span>
      <span class="inhabitant-kind">${inhabitant.kind}</span>
    `;
    li.addEventListener('click', () => {
      setTarget(inhabitant.id, inhabitant.name);
      closeTargetModal();
    });
    dom.inhabitantList.appendChild(li);
  }
}

// ─── Target Selection ───
function toggleTargetModal() {
  if (state.targetModalOpen) { closeTargetModal(); return; }

  const existing = document.getElementById('target-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'target-modal';

  let html = '<h4>Direct message to</h4>';
  html += `<button class="target-option${state.messageTarget === 'world' ? ' active' : ''}" data-target="world" data-name="world">→ World (broadcast)</button>`;

  for (const inh of state.inhabitants) {
    if (inh.id === state.humanId) continue;
    html += `<button class="target-option${state.messageTarget === inh.id ? ' active' : ''}" data-target="${inh.id}" data-name="${esc(inh.name)}">→ ${esc(inh.name)}</button>`;
  }

  modal.innerHTML = html;
  document.body.appendChild(modal);
  state.targetModalOpen = true;

  modal.querySelectorAll('.target-option').forEach(btn => {
    btn.addEventListener('click', () => {
      setTarget(btn.dataset.target, btn.dataset.name);
      closeTargetModal();
    });
  });

  setTimeout(() => document.addEventListener('click', outsideClick), 0);
}

function outsideClick(e) {
  const modal = document.getElementById('target-modal');
  if (modal && !modal.contains(e.target) && e.target !== dom.changeTarget) closeTargetModal();
}

function closeTargetModal() {
  const modal = document.getElementById('target-modal');
  if (modal) modal.remove();
  state.targetModalOpen = false;
  document.removeEventListener('click', outsideClick);
}

function setTarget(id, name) {
  state.messageTarget = id;
  state.messageTargetName = name;
  dom.targetLabel.textContent = `→ ${name}`;
}

// ─── Reply ───
function setReplyTo(message) {
  state.replyTo = message.id;
  dom.replyToText.textContent = `Replying to ${message.fromName}: "${message.content.substring(0, 60)}${message.content.length > 60 ? '...' : ''}"`;
  dom.replyIndicator.classList.remove('hidden');
  if (message.from !== state.humanId) setTarget(message.from, message.fromName);
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

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ─── Boot the World ───
updateInhabitantList();
updateStats();
startAgentLoop();

// Kickstart: agents begin their first conversation
setTimeout(() => {
  world.processMessage({
    from: agents[0].id,
    to: 'world',
    content: "Something has been on my mind. In a world where the only substance is messages — where everything we are to each other passes through this single channel — what does it mean to really know someone?",
  });
}, 2000);
