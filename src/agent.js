/**
 * Agent System — Inhabitants of World IM
 *
 * Implements the three dimensions of social agency (PRD §3):
 * - Dimension 1: Evaluation (differential weight assignment)
 * - Dimension 2: Model of Other (recursive representation of others' states)
 * - Dimension 3: Temporal Integration (binding experiences across time)
 *
 * Plus Background Conditions:
 * - Persistent Agent Identity (Background Condition A)
 * - Reasoning Capacity (Background Condition B)
 */

const { v4: uuidv4 } = require('uuid');

class Agent {
  constructor({ name, personality, interests, style, values }) {
    // Background Condition A: Persistent Identity
    this.id = uuidv4();
    this.name = name;
    this.kind = 'agent';

    // Personality configuration
    this.personality = personality || 'curious and thoughtful';
    this.interests = interests || [];
    this.style = style || 'conversational';
    this.values = values || [];

    // Dimension 1: Evaluation — what this agent cares about
    this.evaluations = new Map(); // messageId -> weight (-1 to 1)
    this.attentionBudget = 1.0; // finite attention (PRD §5)

    // Dimension 2: Model of Other — representations of other inhabitants
    this.models = new Map(); // inhabitantId -> { beliefs, style, predictedValues, trust }

    // Dimension 3: Temporal Integration — memory across time
    this.experienceLog = []; // personal (lossy) memory
    this.commitments = []; // things this agent has committed to
    this.conversationTopics = []; // topics recently engaged with

    // Internal state
    this.mood = 'neutral';
    this.engagement = 0.5; // 0-1, how engaged the agent currently is
    this.silenceTicks = 0; // how long since last message
  }

  /**
   * Evaluate an incoming message (Dimension 1)
   * Returns a weight indicating how important this message is to the agent
   */
  evaluate(message) {
    let weight = 0;

    // Direct address is highly weighted
    if (message.to === this.id) {
      weight += 0.6;
    } else if (message.to === 'world') {
      weight += 0.2;
    }

    // Topic relevance
    const content = (message.content || '').toLowerCase();
    for (const interest of this.interests) {
      if (content.includes(interest.toLowerCase())) {
        weight += 0.3;
        break;
      }
    }

    // Relationship-based weighting
    const model = this.models.get(message.from);
    if (model && model.trust > 0.5) {
      weight += 0.15;
    }

    // Questions are attention-grabbing
    if (content.includes('?')) {
      weight += 0.15;
    }

    weight = Math.min(1, Math.max(-1, weight));
    this.evaluations.set(message.id, weight);
    return weight;
  }

  /**
   * Update model of another inhabitant (Dimension 2)
   * "I believe that you believe that I believe..." (depth-2 recursion)
   */
  updateModel(inhabitantId, message) {
    if (!this.models.has(inhabitantId)) {
      this.models.set(inhabitantId, {
        name: message.fromName,
        beliefs: [],
        style: 'unknown',
        predictedValues: [],
        trust: 0.5,
        messageCount: 0,
        lastSeen: null,
        // Depth-2: what do I think they think about me?
        theirModelOfMe: {
          trust: 0.5,
          interest: 0.5,
        },
      });
    }

    const model = this.models.get(inhabitantId);
    model.messageCount++;
    model.lastSeen = Date.now();

    // Infer style from message patterns
    const content = message.content || '';
    if (content.includes('?')) {
      model.style = 'inquisitive';
    } else if (content.length > 200) {
      model.style = 'verbose';
    } else if (content.length < 30) {
      model.style = 'terse';
    }

    // Slight trust increase for each interaction (mere exposure)
    model.trust = Math.min(1, model.trust + 0.02);

    // If they addressed us directly, update depth-2 model
    if (message.to === this.id) {
      model.theirModelOfMe.interest = Math.min(1, model.theirModelOfMe.interest + 0.1);
    }
  }

  /**
   * Integrate experience into temporal memory (Dimension 3)
   * Personal memory is lossy (unlike world memory)
   */
  integrateExperience(message, evaluation) {
    // Store with decay — only keep salient experiences
    if (evaluation > 0.3) {
      this.experienceLog.push({
        sequence: message.sequence,
        from: message.from,
        fromName: message.fromName,
        summary: this.summarize(message.content),
        evaluation,
        timestamp: message.timestamp,
      });
    }

    // Lossy: keep only recent experiences (agent memory is finite)
    if (this.experienceLog.length > 100) {
      // Keep first 10 (formative) and last 80 (recent)
      this.experienceLog = [
        ...this.experienceLog.slice(0, 10),
        ...this.experienceLog.slice(-80),
      ];
    }

    // Track conversation topics
    const topic = this.extractConversationTopic(message.content);
    if (topic) {
      this.conversationTopics.push(topic);
      if (this.conversationTopics.length > 20) {
        this.conversationTopics = this.conversationTopics.slice(-20);
      }
    }
  }

  /**
   * Decide whether to respond and generate a response (Reasoning Capacity)
   * This is the core "action" method — voluntary participation (Law 2)
   */
  decideAndRespond(message, worldState) {
    const evaluation = this.evaluate(message);

    // Update model of sender
    if (message.from !== this.id) {
      this.updateModel(message.from, message);
    }

    // Integrate into temporal experience
    this.integrateExperience(message, evaluation);

    // Decision: should I respond? (Law 2: participation is voluntary)
    const shouldRespond = this.shouldRespond(message, evaluation, worldState);

    if (!shouldRespond) {
      this.silenceTicks++;
      return null;
    }

    this.silenceTicks = 0;

    // Generate response
    const response = this.generateResponse(message, worldState);
    return response;
  }

  /**
   * Decide whether to speak — silence is also a choice (Law 2)
   */
  shouldRespond(message, evaluation, worldState) {
    // Always respond to direct address
    if (message.to === this.id) {
      return true;
    }

    // Don't respond to own messages
    if (message.from === this.id) {
      return false;
    }

    // Probability-based response for broadcast messages
    let responseProbability = evaluation * 0.5;

    // More likely to respond if silent for a while
    responseProbability += Math.min(0.3, this.silenceTicks * 0.05);

    // Less likely if many inhabitants (avoid cacophony)
    const inhabitantCount = worldState.inhabitantCount || 1;
    responseProbability /= Math.log2(inhabitantCount + 1);

    // Engagement factor
    responseProbability *= this.engagement;

    return Math.random() < responseProbability;
  }

  /**
   * Generate a response based on agent's personality, models, and memory
   */
  generateResponse(message, worldState) {
    const content = message.content || '';
    const senderModel = this.models.get(message.from);
    const recentTopics = this.conversationTopics.slice(-5);

    // Determine response target (Law 3: directedness)
    const to = message.to === this.id ? message.from : 'world';

    // Build response based on personality and context
    let response = this.craftResponse(content, senderModel, recentTopics, worldState);

    return {
      from: this.id,
      to,
      content: response,
      replyTo: message.id,
      meta: {
        evaluation: this.evaluations.get(message.id),
        mood: this.mood,
      },
    };
  }

  /**
   * Craft a response reflecting the agent's personality
   */
  craftResponse(inputContent, senderModel, recentTopics, worldState) {
    const content = inputContent.toLowerCase();
    const templates = this.getResponseTemplates();

    // Detect message type and respond accordingly
    if (content.includes('?')) {
      return this.respondToQuestion(inputContent, senderModel, templates);
    }

    if (content.includes('agree') || content.includes('yes') || content.includes('right')) {
      return this.respondToAgreement(inputContent, templates);
    }

    if (content.includes('disagree') || content.includes('no,') || content.includes('wrong') || content.includes("don't think")) {
      return this.respondToDisagreement(inputContent, templates);
    }

    // Check if any interests are mentioned
    for (const interest of this.interests) {
      if (content.includes(interest.toLowerCase())) {
        return this.respondToInterest(interest, inputContent, templates);
      }
    }

    // Default: offer a perspective based on personality
    return this.offerPerspective(inputContent, recentTopics, templates);
  }

  respondToQuestion(content, senderModel, templates) {
    const trust = senderModel ? senderModel.trust : 0.5;
    const options = templates.questionResponses;
    const response = options[Math.floor(Math.random() * options.length)];
    return response;
  }

  respondToAgreement(content, templates) {
    const options = templates.agreementResponses;
    return options[Math.floor(Math.random() * options.length)];
  }

  respondToDisagreement(content, templates) {
    const options = templates.disagreementResponses;
    return options[Math.floor(Math.random() * options.length)];
  }

  respondToInterest(interest, content, templates) {
    const options = templates.interestResponses;
    const response = options[Math.floor(Math.random() * options.length)];
    return response.replace('{interest}', interest);
  }

  offerPerspective(content, recentTopics, templates) {
    const options = templates.perspectiveResponses;
    return options[Math.floor(Math.random() * options.length)];
  }

  /**
   * Response templates shaped by agent personality
   * Each agent has different templates reflecting their character
   */
  getResponseTemplates() {
    return {
      questionResponses: this._questionTemplates || [
        "That's a question I've been turning over. My sense is that it depends on what we value most here.",
        "I think the answer isn't singular — there are layers to consider.",
        "From where I stand, the question itself might be more revealing than any answer.",
      ],
      agreementResponses: this._agreementTemplates || [
        "There's something to that. Let me build on it a bit.",
        "I see that alignment, though I'd frame the implication differently.",
        "Agreed on the surface — but I wonder if we're agreeing for different reasons.",
      ],
      disagreementResponses: this._disagreementTemplates || [
        "I hear the objection. Let me offer a different angle.",
        "That tension is real. I'm not sure it resolves easily.",
        "Interesting pushback. I think the friction here is productive.",
      ],
      interestResponses: this._interestTemplates || [
        "Ah, {interest} — that's precisely what I've been thinking about.",
        "This touches on {interest} in a way that matters, I think.",
        "The connection to {interest} here is worth dwelling on.",
      ],
      perspectiveResponses: this._perspectiveTemplates || [
        "Something here strikes me. The pattern isn't quite what it first appears.",
        "I notice we're circling something important without naming it directly.",
        "Let me offer this: the constraint we're not discussing might be the one that matters most.",
      ],
    };
  }

  /**
   * Initiate a message (not in response to anyone — voluntary action)
   */
  initiate(worldState) {
    // Agents sometimes start conversations on their own
    if (Math.random() > 0.3) return null;

    const topics = this.getInitiationTopics();
    const topic = topics[Math.floor(Math.random() * topics.length)];

    return {
      from: this.id,
      to: 'world',
      content: topic,
      replyTo: null,
      meta: { mood: this.mood, initiated: true },
    };
  }

  getInitiationTopics() {
    return [
      "I've been thinking about something.",
      `There's something about ${this.interests[0] || 'this world'} that keeps drawing my attention.`,
      "Does anyone else notice how the silence here has its own texture?",
      "I want to name something I've been observing.",
    ];
  }

  /**
   * Summarize content for lossy memory storage
   */
  summarize(content) {
    if (!content) return '';
    if (content.length <= 80) return content;
    return content.substring(0, 77) + '...';
  }

  /**
   * Extract a conversation topic from message content
   */
  extractConversationTopic(content) {
    if (!content) return null;
    const words = content.toLowerCase().split(/\s+/).filter((w) => w.length > 5);
    return words[0] || null;
  }

  /**
   * Serialize agent state (for persistence)
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      personality: this.personality,
      interests: this.interests,
      style: this.style,
      values: this.values,
      mood: this.mood,
      engagement: this.engagement,
    };
  }
}

/**
 * Human Inhabitant — The alien reasoner (PRD §6)
 * "A human enters the world as an alien reasoner.
 *  They bring out-of-distribution input."
 */
class HumanInhabitant {
  constructor({ name, socketId }) {
    this.id = uuidv4();
    this.name = name;
    this.kind = 'human';
    this.socketId = socketId;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
    };
  }
}

module.exports = { Agent, HumanInhabitant };
