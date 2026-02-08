/**
 * World Engine — The physics of World IM (Browser ES Module)
 *
 * Implements:
 * - Law 1: Sequential Ordering
 * - Law 2: Voluntary Participation
 * - Law 3: Directedness
 * - World Memory: persistent record of all events
 * - Relationship tracking
 */

let idCounter = 0;
function generateId() {
  return 'evt_' + Date.now().toString(36) + '_' + (++idCounter).toString(36);
}

export class World {
  constructor() {
    this.memory = [];
    this.sequenceCounter = 0;
    this.inhabitants = new Map();
    this.relationships = new Map();
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    for (const handler of this.listeners.get(event) || []) {
      handler(data);
    }
  }

  enter(inhabitant) {
    this.inhabitants.set(inhabitant.id, inhabitant);
    this.relationships.set(inhabitant.id, new Map());

    for (const [otherId] of this.inhabitants) {
      if (otherId !== inhabitant.id) {
        this.relationships.get(inhabitant.id).set(otherId, {
          model: 'default', entanglement: 0, interactions: 0, lastInteraction: null,
        });
        if (this.relationships.has(otherId)) {
          this.relationships.get(otherId).set(inhabitant.id, {
            model: 'default', entanglement: 0, interactions: 0, lastInteraction: null,
          });
        }
      }
    }

    const event = this.recordEvent({
      type: 'enter',
      inhabitantId: inhabitant.id,
      inhabitantName: inhabitant.name,
      inhabitantKind: inhabitant.kind,
    });
    this.emit('inhabitant:enter', { inhabitant, event });
    return event;
  }

  leave(inhabitantId) {
    const inhabitant = this.inhabitants.get(inhabitantId);
    if (!inhabitant) return null;
    const event = this.recordEvent({
      type: 'leave', inhabitantId, inhabitantName: inhabitant.name,
    });
    this.inhabitants.delete(inhabitantId);
    this.emit('inhabitant:leave', { inhabitantId, event });
    return event;
  }

  processMessage({ from, to, content, replyTo = null, meta = {} }) {
    const sender = this.inhabitants.get(from);
    if (!sender) return null;

    const message = this.recordEvent({
      type: 'message', from, fromName: sender.name, to, content, replyTo, meta,
    });

    this.updateRelationship(from, to, message);
    message.classification = this.classifyExchange(message);
    this.emit('message', message);
    return message;
  }

  recordEvent(data) {
    this.sequenceCounter++;
    const event = {
      id: generateId(),
      sequence: this.sequenceCounter,
      timestamp: Date.now(),
      ...data,
    };
    this.memory.push(event);
    return event;
  }

  updateRelationship(fromId, toId, message) {
    if (toId === 'world') {
      for (const [otherId] of this.inhabitants) {
        if (otherId !== fromId && this.relationships.has(fromId)) {
          const rel = this.relationships.get(fromId).get(otherId);
          if (rel) {
            rel.interactions++;
            rel.lastInteraction = message.sequence;
            if (rel.interactions > 2) rel.model = 'non-default';
          }
        }
      }
      return;
    }
    if (this.relationships.has(fromId)) {
      const rel = this.relationships.get(fromId).get(toId);
      if (rel) {
        rel.interactions++;
        rel.entanglement = Math.min(1, rel.entanglement + 0.1);
        rel.lastInteraction = message.sequence;
        if (rel.interactions > 1) rel.model = 'non-default';
      }
    }
    if (this.relationships.has(toId)) {
      const rel = this.relationships.get(toId).get(fromId);
      if (rel) {
        rel.interactions++;
        rel.entanglement = Math.min(1, rel.entanglement + 0.05);
        rel.lastInteraction = message.sequence;
        if (rel.interactions > 1) rel.model = 'non-default';
      }
    }
  }

  classifyExchange(message) {
    const recent = this.getRecentMessages(20);
    const topics = new Set(recent.map(m => {
      const w = (m.content || '').toLowerCase().split(/\s+/).filter(w => w.length > 4);
      return w[0] || null;
    }).filter(Boolean));
    const words = (message.content || '').toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const current = words[0] || null;
    return (current && !topics.has(current)) ? 'fork' : 'perturbation';
  }

  getRecentMessages(count = 50) {
    return this.memory.filter(e => e.type === 'message').slice(-count);
  }

  getInhabitants() {
    return Array.from(this.inhabitants.values());
  }

  getState() {
    return {
      inhabitantCount: this.inhabitants.size,
      messageCount: this.memory.filter(e => e.type === 'message').length,
      totalEvents: this.memory.length,
      inhabitants: this.getInhabitants().map(i => ({ id: i.id, name: i.name, kind: i.kind })),
    };
  }
}
