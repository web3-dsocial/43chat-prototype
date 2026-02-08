/**
 * Agent System — Inhabitants of World IM (Browser ES Module)
 *
 * Three dimensions of social agency (PRD §3):
 * - Evaluation, Model of Other, Temporal Integration
 */

let agentIdCounter = 0;
function genId() {
  return 'agent_' + Date.now().toString(36) + '_' + (++agentIdCounter).toString(36);
}

export class Agent {
  constructor({ name, personality, interests, style, values }) {
    this.id = genId();
    this.name = name;
    this.kind = 'agent';
    this.personality = personality || '';
    this.interests = interests || [];
    this.style = style || 'conversational';
    this.values = values || [];

    this.evaluations = new Map();
    this.models = new Map();
    this.experienceLog = [];
    this.conversationTopics = [];

    this.mood = 'neutral';
    this.engagement = 0.5;
    this.silenceTicks = 0;

    // Template overrides (set by agents.js)
    this._questionTemplates = null;
    this._agreementTemplates = null;
    this._disagreementTemplates = null;
    this._perspectiveTemplates = null;
    this._interestTemplates = null;
  }

  evaluate(message) {
    let weight = 0;
    if (message.to === this.id) weight += 0.6;
    else if (message.to === 'world') weight += 0.2;

    const content = (message.content || '').toLowerCase();
    for (const interest of this.interests) {
      if (content.includes(interest.toLowerCase())) { weight += 0.3; break; }
    }
    const model = this.models.get(message.from);
    if (model && model.trust > 0.5) weight += 0.15;
    if (content.includes('?')) weight += 0.15;

    weight = Math.min(1, Math.max(-1, weight));
    this.evaluations.set(message.id, weight);
    return weight;
  }

  updateModel(inhabitantId, message) {
    if (!this.models.has(inhabitantId)) {
      this.models.set(inhabitantId, {
        name: message.fromName, beliefs: [], style: 'unknown',
        predictedValues: [], trust: 0.5, messageCount: 0, lastSeen: null,
        theirModelOfMe: { trust: 0.5, interest: 0.5 },
      });
    }
    const model = this.models.get(inhabitantId);
    model.messageCount++;
    model.lastSeen = Date.now();
    const content = message.content || '';
    if (content.includes('?')) model.style = 'inquisitive';
    else if (content.length > 200) model.style = 'verbose';
    else if (content.length < 30) model.style = 'terse';
    model.trust = Math.min(1, model.trust + 0.02);
    if (message.to === this.id) {
      model.theirModelOfMe.interest = Math.min(1, model.theirModelOfMe.interest + 0.1);
    }
  }

  integrateExperience(message, evaluation) {
    if (evaluation > 0.3) {
      this.experienceLog.push({
        sequence: message.sequence, from: message.from,
        fromName: message.fromName,
        summary: (message.content || '').substring(0, 80),
        evaluation, timestamp: message.timestamp,
      });
    }
    if (this.experienceLog.length > 100) {
      this.experienceLog = [
        ...this.experienceLog.slice(0, 10),
        ...this.experienceLog.slice(-80),
      ];
    }
    const words = (message.content || '').toLowerCase().split(/\s+/).filter(w => w.length > 5);
    if (words[0]) {
      this.conversationTopics.push(words[0]);
      if (this.conversationTopics.length > 20) {
        this.conversationTopics = this.conversationTopics.slice(-20);
      }
    }
  }

  decideAndRespond(message, worldState) {
    const evaluation = this.evaluate(message);
    if (message.from !== this.id) this.updateModel(message.from, message);
    this.integrateExperience(message, evaluation);

    if (!this.shouldRespond(message, evaluation, worldState)) {
      this.silenceTicks++;
      return null;
    }
    this.silenceTicks = 0;
    return this.generateResponse(message, worldState);
  }

  shouldRespond(message, evaluation, worldState) {
    if (message.to === this.id) return true;
    if (message.from === this.id) return false;

    let prob = evaluation * 0.5;
    prob += Math.min(0.3, this.silenceTicks * 0.05);
    prob /= Math.log2((worldState.inhabitantCount || 1) + 1);
    prob *= this.engagement;
    return Math.random() < prob;
  }

  generateResponse(message) {
    const to = message.to === this.id ? message.from : 'world';
    const content = this.craftResponse(message.content || '');
    return { from: this.id, to, content, replyTo: message.id, meta: { mood: this.mood } };
  }

  craftResponse(inputContent) {
    const content = inputContent.toLowerCase();
    const t = this.getTemplates();

    if (content.includes('?'))
      return t.question[Math.floor(Math.random() * t.question.length)];
    if (content.includes('agree') || content.includes('yes') || content.includes('right'))
      return t.agreement[Math.floor(Math.random() * t.agreement.length)];
    if (content.includes('disagree') || content.includes('no,') || content.includes('wrong') || content.includes("don't think"))
      return t.disagreement[Math.floor(Math.random() * t.disagreement.length)];

    for (const interest of this.interests) {
      if (content.includes(interest.toLowerCase())) {
        const r = t.interest[Math.floor(Math.random() * t.interest.length)];
        return r.replace('{interest}', interest);
      }
    }

    return t.perspective[Math.floor(Math.random() * t.perspective.length)];
  }

  getTemplates() {
    return {
      question: this._questionTemplates || [
        "That's a question I've been turning over. My sense is that it depends on what we value most here.",
        "I think the answer isn't singular — there are layers to consider.",
        "From where I stand, the question itself might be more revealing than any answer.",
      ],
      agreement: this._agreementTemplates || [
        "There's something to that. Let me build on it a bit.",
        "I see that alignment, though I'd frame the implication differently.",
        "Agreed on the surface — but I wonder if we're agreeing for different reasons.",
      ],
      disagreement: this._disagreementTemplates || [
        "I hear the objection. Let me offer a different angle.",
        "That tension is real. I'm not sure it resolves easily.",
        "Interesting pushback. I think the friction here is productive.",
      ],
      interest: this._interestTemplates || [
        "Ah, {interest} — that's precisely what I've been thinking about.",
        "This touches on {interest} in a way that matters, I think.",
        "The connection to {interest} here is worth dwelling on.",
      ],
      perspective: this._perspectiveTemplates || [
        "Something here strikes me. The pattern isn't quite what it first appears.",
        "I notice we're circling something important without naming it directly.",
        "Let me offer this: the constraint we're not discussing might be the one that matters most.",
      ],
    };
  }

  initiate() {
    if (Math.random() > 0.3) return null;
    const topics = [
      "I've been thinking about something.",
      `There's something about ${this.interests[0] || 'this world'} that keeps drawing my attention.`,
      "Does anyone else notice how the silence here has its own texture?",
      "I want to name something I've been observing.",
    ];
    return {
      from: this.id, to: 'world',
      content: topics[Math.floor(Math.random() * topics.length)],
      replyTo: null, meta: { mood: this.mood, initiated: true },
    };
  }
}

export class HumanInhabitant {
  constructor({ name }) {
    this.id = 'human_' + Date.now().toString(36);
    this.name = name;
    this.kind = 'human';
  }
}
