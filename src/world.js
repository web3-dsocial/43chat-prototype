/**
 * World Engine — The physics of World IM
 *
 * Implements:
 * - Law 1: Sequential Ordering (all messages in strict before/after relation)
 * - Law 2: Voluntary Participation (tracked but not enforced)
 * - Law 3: Directedness (every message has a target)
 * - World Memory: persistent record of all events
 * - Relationship tracking: non-default models + behavioral entanglement
 */

const { v4: uuidv4 } = require('uuid');

class World {
  constructor() {
    // World memory — the persistent, non-lossy record (PRD §4)
    this.memory = [];
    // Sequence counter — enforces Law 1
    this.sequenceCounter = 0;
    // Inhabitants currently in the world
    this.inhabitants = new Map();
    // Relationship graph: Map<inhabitantId, Map<otherId, RelationshipModel>>
    this.relationships = new Map();
    // Event listeners
    this.listeners = new Map();
  }

  /**
   * Register an event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Emit an event to all listeners
   */
  emit(event, data) {
    const handlers = this.listeners.get(event) || [];
    for (const handler of handlers) {
      handler(data);
    }
  }

  /**
   * An inhabitant enters the world (PRD §6)
   * Entry is voluntary. The world does not compel presence.
   */
  enter(inhabitant) {
    this.inhabitants.set(inhabitant.id, inhabitant);
    this.relationships.set(inhabitant.id, new Map());

    // Initialize default models for existing inhabitants
    for (const [otherId] of this.inhabitants) {
      if (otherId !== inhabitant.id) {
        // Default model: categorical, not yet specific (PRD §4)
        this.relationships.get(inhabitant.id).set(otherId, {
          model: 'default',
          entanglement: 0,
          interactions: 0,
          lastInteraction: null,
        });
        // Other inhabitants also form default model of newcomer
        if (this.relationships.has(otherId)) {
          this.relationships.get(otherId).set(inhabitant.id, {
            model: 'default',
            entanglement: 0,
            interactions: 0,
            lastInteraction: null,
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

  /**
   * An inhabitant leaves the world (PRD §6)
   * "Leaving is unmarked. The world does not call the human back."
   */
  leave(inhabitantId) {
    const inhabitant = this.inhabitants.get(inhabitantId);
    if (!inhabitant) return null;

    const event = this.recordEvent({
      type: 'leave',
      inhabitantId,
      inhabitantName: inhabitant.name,
    });

    this.inhabitants.delete(inhabitantId);
    this.emit('inhabitant:leave', { inhabitantId, event });
    return event;
  }

  /**
   * Process a message — the fundamental act of this world (PRD §1, §4)
   *
   * Every message:
   * - Gets a sequential position (Law 1)
   * - Is voluntary (Law 2)
   * - Is directed at something (Law 3)
   * - Carries constraint material + commitment exposure (PRD §4)
   */
  processMessage({ from, to, content, replyTo = null, meta = {} }) {
    const sender = this.inhabitants.get(from);
    if (!sender) return null;

    const message = this.recordEvent({
      type: 'message',
      from,
      fromName: sender.name,
      to, // directed target: inhabitant id, 'world' (broadcast), or specific id
      content,
      replyTo,
      meta,
    });

    // Update relationship models (PRD §4: behavioral entanglement)
    this.updateRelationship(from, to, message);

    // Classify: fork or perturbation (PRD §4)
    message.classification = this.classifyExchange(message);

    this.emit('message', message);
    return message;
  }

  /**
   * Record an event into world memory with sequential ordering
   */
  recordEvent(data) {
    this.sequenceCounter++;
    const event = {
      id: uuidv4(),
      sequence: this.sequenceCounter,
      timestamp: Date.now(),
      ...data,
    };
    this.memory.push(event);
    return event;
  }

  /**
   * Update the relationship model between two inhabitants
   * A relationship exists when: non-default model + behavioral entanglement (PRD §4)
   */
  updateRelationship(fromId, toId, message) {
    if (toId === 'world') {
      // Broadcast: update all relationships slightly
      for (const [otherId] of this.inhabitants) {
        if (otherId !== fromId && this.relationships.has(fromId)) {
          const rel = this.relationships.get(fromId).get(otherId);
          if (rel) {
            rel.interactions++;
            rel.lastInteraction = message.sequence;
            if (rel.interactions > 2) {
              rel.model = 'non-default';
            }
          }
        }
      }
      return;
    }

    // Direct message: stronger entanglement
    if (this.relationships.has(fromId)) {
      const rel = this.relationships.get(fromId).get(toId);
      if (rel) {
        rel.interactions++;
        rel.entanglement = Math.min(1, rel.entanglement + 0.1);
        rel.lastInteraction = message.sequence;
        if (rel.interactions > 1) {
          rel.model = 'non-default';
        }
      }
    }

    // Reciprocal entanglement (being addressed changes your state too)
    if (this.relationships.has(toId)) {
      const rel = this.relationships.get(toId).get(fromId);
      if (rel) {
        rel.interactions++;
        rel.entanglement = Math.min(1, rel.entanglement + 0.05);
        rel.lastInteraction = message.sequence;
        if (rel.interactions > 1) {
          rel.model = 'non-default';
        }
      }
    }
  }

  /**
   * Classify an exchange as fork or perturbation (PRD §4)
   * Fork: frame-shift that reorganizes interpretation
   * Perturbation: new data slotted into existing frame
   *
   * For MVP: simple heuristic based on content novelty
   */
  classifyExchange(message) {
    const recentMessages = this.getRecentMessages(20);
    const recentTopics = new Set(
      recentMessages.map((m) => this.extractTopic(m.content)).filter(Boolean)
    );

    const currentTopic = this.extractTopic(message.content);
    if (currentTopic && !recentTopics.has(currentTopic)) {
      return 'fork';
    }
    return 'perturbation';
  }

  /**
   * Simple topic extraction for fork/perturbation classification
   */
  extractTopic(content) {
    if (!content) return null;
    // Extract first significant word as crude topic
    const words = content.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    return words[0] || null;
  }

  /**
   * Get recent messages from world memory
   */
  getRecentMessages(count = 50) {
    return this.memory
      .filter((e) => e.type === 'message')
      .slice(-count);
  }

  /**
   * Get full world memory (the world's non-lossy record)
   */
  getMemory() {
    return [...this.memory];
  }

  /**
   * Get all current inhabitants
   */
  getInhabitants() {
    return Array.from(this.inhabitants.values());
  }

  /**
   * Get relationship data for an inhabitant
   */
  getRelationships(inhabitantId) {
    const rels = this.relationships.get(inhabitantId);
    if (!rels) return {};
    const result = {};
    for (const [otherId, rel] of rels) {
      result[otherId] = { ...rel };
    }
    return result;
  }

  /**
   * Get world state summary
   */
  getState() {
    return {
      inhabitantCount: this.inhabitants.size,
      messageCount: this.memory.filter((e) => e.type === 'message').length,
      totalEvents: this.memory.length,
      inhabitants: this.getInhabitants().map((i) => ({
        id: i.id,
        name: i.name,
        kind: i.kind,
      })),
    };
  }
}

module.exports = { World };
